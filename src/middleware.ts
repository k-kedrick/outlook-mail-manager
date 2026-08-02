import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/login" ||
    pathname === "/redeem" ||
    pathname.startsWith("/api/redeem") ||
    pathname.startsWith("/api/v2/redemptions") ||
    pathname.startsWith("/api/v2/auth/bootstrap") ||
    pathname === "/api/v2/auth/login" ||
    pathname === "/api/v2/oauth/microsoft/callback" ||
    pathname === "/api/health/live" ||
    pathname === "/api/health/ready" ||
    pathname === "/internal/metrics" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  if (isPublic || request.cookies.get("omm_session")?.value) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    const requestId = crypto.randomUUID();
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "请先登录。", requestId } },
      { status: 401, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
    );
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
