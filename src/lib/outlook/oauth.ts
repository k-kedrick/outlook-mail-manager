import type { MailAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

export type TokenKind = "graph" | "imap";

const SCOPES: Record<TokenKind, string> = {
  graph: "https://graph.microsoft.com/Mail.Read offline_access",
  imap: "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
};

// Primary v2.0 consumer endpoint; legacy MSA endpoint kept as a fallback.
const TOKEN_ENDPOINTS = [
  "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
  "https://login.live.com/oauth20_token.srf",
];

const EXPIRY_BUFFER_MS = 60_000; // refresh a bit early

// MSA refresh tokens don't report an expiry; model a 90-day sliding window that
// resets on every successful refresh.
export const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 90;

// Rotation rate-limit backstop: never hit the token endpoint for the same account
// more than once per this window. Guards against rapid clicks / concurrent ticks /
// misconfiguration causing excessive refresh-token rotations (a ban risk).
export const MIN_ROTATION_INTERVAL_MS = 5 * 60_000;
const lastRefreshAttempt = new Map<string, number>();
const lastAccountRefreshAttempt = new Map<string, number>();
type InFlightRefresh = { kind: TokenKind; forceRefresh: boolean; promise: Promise<string> };
const refreshInFlight = new Map<string, InFlightRefresh>();

/** True when a refresh was skipped by the rate-limit backstop (not a real failure). */
export function isThrottleError(error: unknown): boolean {
  return error instanceof OAuthError && error.code === "throttled";
}

/** Small random delay to avoid synchronized bursts of auth requests from one IP. */
export function jitter(maxMs = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * maxMs)));
}

export class OAuthError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, description: string, httpStatus: number) {
    super(description || code || "OAuth 请求失败");
    this.name = "OAuthError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** Map an OAuth failure to a MailAccount.status value. */
export function statusFromError(error: unknown): "AUTH_FAILED" | "LOCKED" | "ERROR" {
  if (error instanceof OAuthError) {
    if (error.code === "invalid_grant") return "AUTH_FAILED";
    if (/lock|blocked|disabled|suspend/i.test(error.message)) return "LOCKED";
  }
  if (Boolean((error as { authenticationFailed?: boolean } | null)?.authenticationFailed)) {
    return "LOCKED";
  }
  return "ERROR";
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

async function exchange(clientId: string, refreshToken: string, kind: TokenKind): Promise<TokenResponse> {
  let lastError: OAuthError | null = null;

  for (const endpoint of TOKEN_ENDPOINTS) {
    const params = new URLSearchParams();
    params.set("client_id", clientId);
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", refreshToken);
    params.set("scope", SCOPES[kind]);
    if (endpoint.includes("login.live.com")) {
      params.set("redirect_uri", "https://login.live.com/oauth20_desktop.srf");
    }

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
    } catch (networkError) {
      lastError = new OAuthError(
        "network_error",
        networkError instanceof Error ? networkError.message : "网络请求失败",
        0,
      );
      continue;
    }

    const data = (await res.json().catch(() => ({}))) as TokenResponse;

    if (res.ok && data.access_token) {
      return data;
    }

    lastError = new OAuthError(data.error || "unknown_error", data.error_description || "", res.status);
    // invalid_grant means the refresh token itself is dead — no point trying other endpoints.
    if (data.error === "invalid_grant") {
      throw lastError;
    }
  }

  throw lastError ?? new OAuthError("unknown_error", "未能获取访问令牌", 0);
}

function cachedToken(account: MailAccount, kind: TokenKind): string | null {
  const cipher = kind === "graph" ? account.graphTokenCipher : account.imapTokenCipher;
  const expiresAt = kind === "graph" ? account.graphTokenExpiresAt : account.imapTokenExpiresAt;
  if (!cipher || !expiresAt) return null;
  if (expiresAt.getTime() - EXPIRY_BUFFER_MS <= Date.now()) return null;
  try {
    return decryptSecret(cipher);
  } catch {
    return null;
  }
}

/**
 * Return a valid access token for the requested resource, refreshing (and
 * persisting any rotated refresh token / cached access token) as needed.
 * Throws OAuthError on failure.
 */
async function getAccessTokenInternal(
  account: MailAccount,
  kind: TokenKind,
  { forceRefresh = false }: { forceRefresh?: boolean } = {},
): Promise<string> {
  if (!forceRefresh) {
    const cached = cachedToken(account, kind);
    if (cached) return cached;
  }

  // Rate-limit backstop: if we hit the token endpoint for this account very
  // recently, don't do it again. A normal read may reuse a cached token, but an
  // explicit keep-alive must report "throttled" rather than pretend the cached
  // access token was a successful refresh-token rotation.
  const nowMs = Date.now();
  const attemptKey = `${account.id}:${kind}`;
  const lastAttempt = forceRefresh
    ? lastAccountRefreshAttempt.get(account.id) ?? 0
    : lastRefreshAttempt.get(attemptKey) ?? 0;
  if (nowMs - lastAttempt < MIN_ROTATION_INTERVAL_MS) {
    if (!forceRefresh) {
      const cached = cachedToken(account, kind);
      if (cached) return cached;
    }
    throw new OAuthError("throttled", "刷新过于频繁，已跳过（请稍后再试）", 429);
  }
  lastRefreshAttempt.set(attemptKey, nowMs);
  lastAccountRefreshAttempt.set(account.id, nowMs);

  const refreshToken = decryptSecret(account.refreshTokenCipher);
  const data = await exchange(account.clientId, refreshToken, kind);

  const accessToken = data.access_token as string;
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  const now = new Date();

  const update: Record<string, unknown> = {};
  // "上次刷新" (refreshTokenUpdatedAt) and "令牌有效期" (refreshTokenExpiresAt) must
  // both reflect ONLY an explicit keep-alive/refresh (forceRefresh). A read
  // (status/mail/code) that rotates a cold access token still persists the rotated
  // refresh token below so it keeps working, but must NOT touch either field —
  // otherwise the "令牌有效期" countdown would silently reset to 90 天 on every read.
  if (forceRefresh) {
    // A successful forced refresh slid the inactivity window forward — reset the
    // validity countdown and stamp the refresh time.
    const ttlSeconds =
      typeof data.refresh_token_expires_in === "number"
        ? data.refresh_token_expires_in
        : DEFAULT_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
    update.refreshTokenUpdatedAt = now;
    update.refreshTokenExpiresAt = new Date(Date.now() + ttlSeconds * 1000);
  }
  if (kind === "graph") {
    update.graphTokenCipher = encryptSecret(accessToken);
    update.graphTokenExpiresAt = expiresAt;
  } else {
    update.imapTokenCipher = encryptSecret(accessToken);
    update.imapTokenExpiresAt = expiresAt;
  }

  // Persist a rotated refresh token so future refreshes keep working.
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    update.refreshTokenCipher = encryptSecret(data.refresh_token);
    // The rotated token invalidates cached tokens for the *other* resource.
    if (kind === "graph") {
      update.imapTokenCipher = null;
      update.imapTokenExpiresAt = null;
    } else {
      update.graphTokenCipher = null;
      update.graphTokenExpiresAt = null;
    }
    account.refreshTokenCipher = update.refreshTokenCipher as string;
  }

  await prisma.mailAccount.update({ where: { id: account.id }, data: update });

  // Keep the in-memory object consistent for callers reusing it.
  if (forceRefresh) {
    account.refreshTokenUpdatedAt = now;
    if (update.refreshTokenExpiresAt instanceof Date) {
      account.refreshTokenExpiresAt = update.refreshTokenExpiresAt;
    }
  }
  if (kind === "graph") {
    account.graphTokenCipher = update.graphTokenCipher as string;
    account.graphTokenExpiresAt = expiresAt;
  } else {
    account.imapTokenCipher = update.imapTokenCipher as string;
    account.imapTokenExpiresAt = expiresAt;
  }

  return accessToken;
}

export async function getAccessToken(
  account: MailAccount,
  kind: TokenKind,
  options: { forceRefresh?: boolean } = {},
): Promise<string> {
  if (!options.forceRefresh) {
    const cached = cachedToken(account, kind);
    if (cached) return cached;
  }

  const existing = refreshInFlight.get(account.id);
  if (existing) {
    // Only the same audience may share an access-token Promise. A Graph token
    // is invalid for Outlook/IMAP and vice versa. Force refreshes may share only
    // another genuine force refresh, never a normal cache fill.
    if (existing.kind === kind && (!options.forceRefresh || existing.forceRefresh)) {
      return existing.promise;
    }
    await existing.promise.catch(() => undefined);
    const latest = await prisma.mailAccount.findUnique({
      where: { id: account.id },
      select: {
        refreshTokenCipher: true,
        graphTokenCipher: true,
        graphTokenExpiresAt: true,
        imapTokenCipher: true,
        imapTokenExpiresAt: true,
      },
    });
    if (latest) Object.assign(account, latest);
    return getAccessToken(account, kind, options);
  }

  const pending = getAccessTokenInternal(account, kind, options).finally(() => {
    if (refreshInFlight.get(account.id)?.promise === pending) refreshInFlight.delete(account.id);
  });
  refreshInFlight.set(account.id, { kind, forceRefresh: Boolean(options.forceRefresh), promise: pending });
  return pending;
}

export function resetOAuthStateForTests(): void {
  lastRefreshAttempt.clear();
  lastAccountRefreshAttempt.clear();
  refreshInFlight.clear();
}
