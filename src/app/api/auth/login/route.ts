import { fail, ok, routeError } from "@/lib/api";
import { setSessionCookie, verifyAdminPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request): Promise<Response> {
  try {
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
