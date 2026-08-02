import { z } from "zod";
import { authService } from "@/modules/auth/composition";
import { AuthenticationError } from "@/modules/auth/domain/admin-auth";
import { requestClientContext, setV2SessionCookies } from "@/modules/auth/presentation/next-auth";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";
import { consumeRateLimit } from "@/shared/rate-limit/postgres-rate-limit";

const inputSchema = z.object({
  password: z.string().min(1),
  totp: z.string().regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().min(10).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const client = requestClientContext(request);
    const limited = await consumeRateLimit("admin-login", client.ip ?? "unknown", 5, 60_000);
    if (!limited.allowed) {
      return apiFailure("RATE_LIMITED", "登录尝试过于频繁，请稍后再试。", 429, {
        requestId,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      });
    }
    const input = inputSchema.parse(await request.json());
    const session = await authService.login(input, client);
    const response = apiSuccess({ authenticated: true }, { requestId });
    setV2SessionCookies(response, session);
    return response;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return apiFailure(error.code, "密码或二次验证码不正确。", 401, { requestId });
    }
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "登录参数不正确。", 422, { requestId });
    return apiFailure("INTERNAL_ERROR", "登录服务暂时不可用。", 500, { requestId });
  }
}
