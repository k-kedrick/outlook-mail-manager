import { fail, ok, routeError } from "@/lib/api";
import { requireAuth, verifyAdminPassword } from "@/lib/auth";
import { hashPassword } from "@/lib/secrets";
import { setAdminPasswordHash } from "@/lib/settings";
import { passwordChangeSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Change the admin login password. Requires the current password (checked against
// the stored hash, or the ADMIN_PASSWORD env fallback if none set yet).
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const { currentPassword, newPassword } = passwordChangeSchema.parse(await request.json());

    if (!(await verifyAdminPassword(currentPassword))) {
      return fail("当前密码不正确。", 401);
    }
    await setAdminPasswordHash(hashPassword(newPassword));
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
