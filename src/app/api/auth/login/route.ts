import { fail, ok, rateLimited, routeError } from "@/lib/api";
import { setSessionCookie, verifyAdminPassword } from "@/lib/auth";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    const limited = checkRateLimit("login", requestIp(request), 5, 60_000);
    if (!limited.allowed) return rateLimited(limited.retryAfter);
    const { password } = loginSchema.parse(await request.json());
    if (!(await verifyAdminPassword(password))) {
      return fail("口令错误。", 401);
    }
    await setSessionCookie();
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
