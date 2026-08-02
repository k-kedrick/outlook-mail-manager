import { z } from "zod";
import { authService } from "@/modules/auth/composition";
import { AuthenticationError } from "@/modules/auth/domain/admin-auth";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const inputSchema = z.object({
  bootstrapPassword: z.string().min(1),
  newPassword: z.string().min(12).max(256),
});

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    return apiSuccess({ required: await authService.bootstrapRequired() }, { requestId });
  } catch {
    return apiFailure("BOOTSTRAP_STATUS_FAILED", "无法读取初始化状态。", 503, { requestId });
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    return apiSuccess(await authService.startBootstrap(inputSchema.parse(await request.json())), { requestId });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return apiFailure(error.code, "无法开始管理员初始化。", 403, { requestId });
    }
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "初始化参数不正确。", 422, { requestId });
    return apiFailure("INTERNAL_ERROR", "初始化暂时不可用。", 500, { requestId });
  }
}
