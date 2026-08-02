import { ok, routeError } from "@/lib/api";
import { clearSessionCookie, requireAuth } from "@/lib/auth";

export async function POST(): Promise<Response> {
  try {
    await requireAuth();
    await clearSessionCookie();
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
