import { z } from "zod";
import { authService } from "@/modules/auth/composition";
import { AuthenticationError } from "@/modules/auth/domain/admin-auth";
import { requestClientContext, setV2SessionCookies } from "@/modules/auth/presentation/next-auth";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const inputSchema = z.object({ setupToken: z.string().min(1), code: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const input = inputSchema.parse(await request.json());
    const result = await authService.confirmBootstrap(input.setupToken, input.code, requestClientContext(request));
    const response = apiSuccess({ recoveryCodes: result.recoveryCodes }, { requestId });
    setV2SessionCookies(response, result.session);
    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return apiFailure(error.code, "验证码无效或初始化已过期。", 403, { requestId });
    }
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "确认参数不正确。", 422, { requestId });
    return apiFailure("INTERNAL_ERROR", "无法完成管理员初始化。", 500, { requestId });
  }
}
