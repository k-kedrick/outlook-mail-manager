import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";
import type { SessionTokens } from "../application/auth-service";
import { authService } from "../composition";

export const V2_SESSION_COOKIE = "omm_session";
export const V2_CSRF_COOKIE = "omm_csrf";

export function setV2SessionCookies(response: NextResponse, session: SessionTokens): void {
  const secure = process.env.NODE_ENV === "production";
  const maxAge = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
  response.cookies.set(V2_SESSION_COOKIE, session.sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge,
  });
  response.cookies.set(V2_CSRF_COOKIE, session.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}

export function clearV2SessionCookies(response: NextResponse): void {
  response.cookies.set(V2_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(V2_CSRF_COOKIE, "", { path: "/", maxAge: 0 });
}

export async function requireV2Admin(request: Request, csrf = false) {
  const store = await cookies();
  const session = await authService.authenticate(store.get(V2_SESSION_COOKIE)?.value);
  if (csrf) authService.validateCsrf(session, request.headers.get("x-csrf-token") ?? undefined);
  return session;
}

export async function requireV2AdminPage() {
  const store = await cookies();
  try {
    return await authService.authenticate(store.get(V2_SESSION_COOKIE)?.value);
  } catch {
    redirect("/login");
  }
}

export function requestClientContext(request: Request): { ip?: string; userAgent?: string } {
  return {
    ip: request.headers.get("x-real-ip") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
}
