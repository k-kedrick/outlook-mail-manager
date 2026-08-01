import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Lightweight presence gate for a nicer redirect UX. Cryptographic verification
// (and real enforcement) happens in server components / route handlers via
// requireAuth() / requireAuthPage(), which run on the Node runtime.
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    // Public card-key redemption — gated by the card key itself, not admin login.
    pathname === "/redeem" ||
    pathname.startsWith("/api/redeem") ||
    pathname === "/api/health" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  if (isPublic) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { message: "请先登录。" } }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
