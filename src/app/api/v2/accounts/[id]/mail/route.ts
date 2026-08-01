import { z } from "zod";
import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { mailRouter } from "@/modules/mail/composition";
import { ProviderError, publicProviderMessage } from "@/modules/mail/domain/provider-error";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const querySchema = z.object({
  folder: z.enum(["inbox", "junk"]).default("inbox"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(8192).optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request);
    const { id } = await context.params;
    const url = new URL(request.url);
    const query = querySchema.parse(Object.fromEntries(url.searchParams));
    const page = await mailRouter.list({ accountId: id, ...query });
    return apiSuccess(page, { requestId });
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.code === "RATE_LIMITED" ? 429 : error.code === "MESSAGE_NOT_FOUND" ? 404 : 502;
      return apiFailure(error.code, publicProviderMessage(error.code), status, {
        requestId,
        ...(error.retryAfterMs ? { headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) } } : {}),
      });
    }
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "邮件查询参数不正确。", 422, { requestId });
    return apiFailure("UNAUTHORIZED", "请重新登录。", 401, { requestId });
  }
}
