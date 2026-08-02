import { z } from "zod";
import { authService } from "@/modules/auth/composition";
import { AuthenticationError } from "@/modules/auth/domain/admin-auth";
import { clearV2SessionCookies, requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(256),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireV2Admin(request, true);
    const input = schema.parse(await request.json());
    await authService.changePassword(session.adminId, input.currentPassword, input.newPassword);
    const response = apiSuccess({ authenticated: false }, { requestId });
    clearV2SessionCookies(response);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "密码至少需要 12 位。", 422, { requestId });
    if (error instanceof AuthenticationError) return apiFailure(error.code, "当前密码不正确。", 403, { requestId });
    return apiFailure("PASSWORD_CHANGE_FAILED", "暂时无法修改密码。", 500, { requestId });
  }
}
