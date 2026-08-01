import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/session";
import { getConfig } from "@/lib/settings";
import { verifyPasswordHash } from "@/lib/secrets";
import { adminPassword, appSecret } from "@/lib/server-env";

export { SESSION_COOKIE };
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

type SessionPayload = {
  sub: "admin";
  exp: number;
  version: number;
};

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", appSecret()).update(payload).digest("base64url");
}

export function verifyPassword(input: string): boolean {
  const expected = Buffer.from(adminPassword());
  const actual = Buffer.from(input);
  if (expected.length !== actual.length) {
    // Still run a comparison to reduce timing signal, then fail.
    timingSafeEqual(expected, Buffer.alloc(expected.length));
    return false;
  }
  return timingSafeEqual(expected, actual);
}

/**
 * Verify the admin login password: check the DB-stored hash if one has been set
 * (via the settings dialog), otherwise fall back to the ADMIN_PASSWORD env var.
 */
export async function verifyAdminPassword(input: string): Promise<boolean> {
  const config = await getConfig();
  if (config.adminPasswordHash) {
    return verifyPasswordHash(input, config.adminPasswordHash);
  }
  return verifyPassword(input);
}

export async function createSessionToken(): Promise<string> {
  const { sessionVersion } = await getConfig();
  const payload = encode({
    sub: "admin",
    exp: Date.now() + SESSION_TTL_MS,
    version: sessionVersion,
  } satisfies SessionPayload);
  return `${payload}.${sign(payload)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (parsed.sub !== "admin" || parsed.exp <= Date.now() || !Number.isInteger(parsed.version)) return false;
    const { sessionVersion } = await getConfig();
    return parsed.version === sessionVersion;
  } catch {
    return false;
  }
}

export async function setSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** For API route handlers: throws "UNAUTHORIZED" (mapped to 401 by routeError). */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) {
    throw new Error("UNAUTHORIZED");
  }
}

/** For server components: redirects to /login when not authenticated. */
export async function requireAuthPage(): Promise<void> {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
}
