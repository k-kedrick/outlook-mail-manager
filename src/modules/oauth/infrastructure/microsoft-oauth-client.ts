import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
  SignJWT,
  type JWTPayload,
} from "jose";
import { env } from "@/shared/config/env";
import { sha256 } from "@/shared/crypto/hash";
import { Semaphore } from "@/shared/concurrency/semaphore";
import type {
  AccessTokenProfile,
  AuthorizationTokens,
  OAuthClient,
  OAuthGrant,
  OAuthIdentity,
  RefreshTokens,
} from "../domain/oauth";
import { OAuthDomainError, RESOURCE_SCOPES } from "../domain/oauth";

const JWKS = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"),
);

const PROFILE_SCOPES: Record<AccessTokenProfile, string> = {
  graph_mail: "https://graph.microsoft.com/Mail.Read offline_access",
  imap_mail: "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
  outlook_rest_legacy: "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function tenantEndpoint(tenant: string, path: "authorize" | "token"): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/${path}`;
}

function thumbprintHeader(value: string): string {
  const normalized = value.replace(/[:\s]/g, "");
  return /^[a-fA-F0-9]+$/.test(normalized) && normalized.length % 2 === 0
    ? Buffer.from(normalized, "hex").toString("base64url")
    : normalized;
}

let privateKeyPromise: ReturnType<typeof importPKCS8> | undefined;

async function clientAssertion(audience: string): Promise<string> {
  const config = env();
  if (!config.MICROSOFT_CLIENT_ID || !config.MICROSOFT_PRIVATE_KEY_PATH || !config.MICROSOFT_CERTIFICATE_THUMBPRINT) {
    throw new OAuthDomainError("INVALID_RESPONSE", false, "Managed Microsoft OAuth is not configured");
  }
  privateKeyPromise ??= readFile(config.MICROSOFT_PRIVATE_KEY_PATH, "utf8").then((pem) => importPKCS8(pem, "RS256"));
  const key = await privateKeyPromise;
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({
      alg: "RS256",
      typ: "JWT",
      x5t: thumbprintHeader(config.MICROSOFT_CERTIFICATE_THUMBPRINT),
    })
    .setIssuer(config.MICROSOFT_CLIENT_ID)
    .setSubject(config.MICROSOFT_CLIENT_ID)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(randomUUID())
    .sign(key);
}

async function tokenRequestUnbounded(
  endpoint: string,
  params: URLSearchParams,
  managed: boolean,
): Promise<{ data: TokenResponse; headers: Headers }> {
  if (managed) {
    params.set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
    params.set("client_assertion", await clientAssertion(endpoint));
  }
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new OAuthDomainError("NETWORK_ERROR", true, "Microsoft token endpoint is unreachable");
  }
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !data.access_token) {
    const code = data.error ?? `HTTP_${response.status}`;
    if (code === "invalid_grant") throw new OAuthDomainError("AUTH_REQUIRED", false, code);
    if (code === "interaction_required" || code === "consent_required" || code === "invalid_scope") {
      throw new OAuthDomainError("PERMISSION_DENIED", false, code);
    }
    if (response.status === 429) {
      const retrySeconds = Number(response.headers.get("retry-after") ?? "60");
      throw new OAuthDomainError("RATE_LIMITED", true, code, Math.max(1, retrySeconds) * 1000);
    }
    throw new OAuthDomainError("INVALID_RESPONSE", response.status >= 500, code);
  }
  return { data, headers: response.headers };
}

let oauthSemaphore: Semaphore | undefined;
function tokenRequest(endpoint: string, params: URLSearchParams, managed: boolean): Promise<{ data: TokenResponse; headers: Headers }> {
  oauthSemaphore ??= new Semaphore(env().OAUTH_CONCURRENCY);
  return oauthSemaphore.run(() => tokenRequestUnbounded(endpoint, params, managed));
}

function mapTokens(data: TokenResponse, requireIdToken: true): AuthorizationTokens;
function mapTokens(data: TokenResponse, requireIdToken: false): RefreshTokens;
function mapTokens(data: TokenResponse, requireIdToken: boolean): AuthorizationTokens | RefreshTokens {
  if (!data.access_token || !data.refresh_token || (requireIdToken && !data.id_token)) {
    throw new OAuthDomainError("INVALID_RESPONSE", false, "Microsoft token response is incomplete");
  }
  const now = Date.now();
  const base = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(now + Math.max(60, data.expires_in ?? 3600) * 1000),
    ...(data.refresh_token_expires_in
      ? { providerRefreshExpiresAt: new Date(now + data.refresh_token_expires_in * 1000) }
      : {}),
    scopes: data.scope?.split(/\s+/).filter(Boolean) ?? [],
  };
  return requireIdToken ? { ...base, idToken: data.id_token as string } : base;
}

export class MicrosoftOAuthClient implements OAuthClient {
  authorizationUrl(input: {
    resource: "graph" | "outlook_imap";
    state: string;
    nonce: string;
    codeChallenge: string;
    loginHint?: string;
  }): string {
    const config = env();
    if (!config.MICROSOFT_CLIENT_ID) {
      throw new OAuthDomainError("INVALID_RESPONSE", false, "Managed Microsoft OAuth is not configured");
    }
    const url = new URL(tenantEndpoint("common", "authorize"));
    url.search = new URLSearchParams({
      client_id: config.MICROSOFT_CLIENT_ID,
      response_type: "code",
      redirect_uri: `${config.NEXT_PUBLIC_APP_URL}/api/v2/oauth/microsoft/callback`,
      response_mode: "query",
      scope: RESOURCE_SCOPES[input.resource].join(" "),
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
      prompt: input.resource === "outlook_imap" ? "consent" : "select_account",
      ...(input.loginHint ? { login_hint: input.loginHint } : {}),
    }).toString();
    return url.toString();
  }

  async redeemAuthorizationCode(code: string, verifier: string): Promise<AuthorizationTokens> {
    const config = env();
    if (!config.MICROSOFT_CLIENT_ID) {
      throw new OAuthDomainError("INVALID_RESPONSE", false, "Managed Microsoft OAuth is not configured");
    }
    const endpoint = tenantEndpoint("common", "token");
    const params = new URLSearchParams({
      client_id: config.MICROSOFT_CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${config.NEXT_PUBLIC_APP_URL}/api/v2/oauth/microsoft/callback`,
      code_verifier: verifier,
    });
    const { data } = await tokenRequest(endpoint, params, true);
    return mapTokens(data, true);
  }

  async verifyIdentity(idToken: string, expectedNonceHash: string, graphAccessToken?: string): Promise<OAuthIdentity> {
    const config = env();
    if (!config.MICROSOFT_CLIENT_ID) throw new OAuthDomainError("INVALID_RESPONSE", false, "Missing client ID");
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, JWKS, { audience: config.MICROSOFT_CLIENT_ID }));
    } catch {
      throw new OAuthDomainError("INVALID_RESPONSE", false, "Microsoft ID token verification failed");
    }
    const tenantId = typeof payload.tid === "string" ? payload.tid : "";
    const issuer = typeof payload.iss === "string" ? payload.iss : "";
    const subject = typeof payload.sub === "string" ? payload.sub : "";
    const nonce = typeof payload.nonce === "string" ? payload.nonce : "";
    const expectedIssuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
    if (!tenantId || !subject || issuer !== expectedIssuer || !nonce || sha256(nonce) !== expectedNonceHash) {
      throw new OAuthDomainError("INVALID_RESPONSE", false, "Microsoft identity claims do not match the OAuth flow");
    }
    let email = typeof payload.preferred_username === "string"
      ? payload.preferred_username
      : typeof payload.email === "string"
        ? payload.email
        : "";
    if (graphAccessToken) {
      const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
        headers: { Authorization: `Bearer ${graphAccessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      }).catch(() => undefined);
      if (response?.ok) {
        const me = (await response.json()) as { mail?: string; userPrincipalName?: string };
        email = me.mail || me.userPrincipalName || email;
      }
    }
    if (!email) throw new OAuthDomainError("INVALID_RESPONSE", false, "Microsoft account email is unavailable");
    return {
      subject,
      tenantId,
      issuer,
      email,
      accountType: tenantId === "9188040d-6c67-4c5b-b112-36a304b66dad" ? "personal" : "organization",
    };
  }

  async refresh(grant: OAuthGrant, profile: AccessTokenProfile, refreshToken: string): Promise<RefreshTokens> {
    const tenant = grant.tenantId || "common";
    const endpoint = tenantEndpoint(tenant, "token");
    const params = new URLSearchParams({
      client_id: grant.clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: PROFILE_SCOPES[profile],
    });
    const { data } = await tokenRequest(endpoint, params, grant.source === "managed");
    return mapTokens(data, false);
  }
}
