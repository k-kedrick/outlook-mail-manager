import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { mailRouter } from "@/modules/mail/composition";
import { decodeMailToken } from "@/modules/mail/domain/opaque-token";
import { ProviderError, publicProviderMessage } from "@/modules/mail/domain/provider-error";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; messageId: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request);
    const { id, messageId } = await context.params;
    const reference = decodeMailToken(messageId, "message");
    const message = await mailRouter.getMessage({ accountId: id, folder: reference.folder, messageId });
    return apiSuccess(message, { requestId });
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.code === "MESSAGE_NOT_FOUND" ? 404 : error.code === "RATE_LIMITED" ? 429 : 502;
      return apiFailure(error.code, publicProviderMessage(error.code), status, { requestId });
    }
    return apiFailure("UNAUTHORIZED", "请重新登录。", 401, { requestId });
  }
}
