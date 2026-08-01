import { z } from "zod";
import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { oauthFlowService } from "@/modules/oauth/composition";
import { OAuthDomainError } from "@/modules/oauth/domain/oauth";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const inputSchema = z.object({ resource: z.enum(["graph", "outlook_imap"]) });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const admin = await requireV2Admin(request, true);
    const { id } = await context.params;
    const input = inputSchema.parse(await request.json());
    const result = await oauthFlowService.start({
      adminId: admin.adminId,
      accountId: id,
      resource: input.resource,
    });
    return apiSuccess(result, { requestId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiFailure("INVALID_INPUT", "重新授权参数不正确。", 422, { requestId });
    }
    if (error instanceof OAuthDomainError) {
      const status = error.code === "INVALID_RESPONSE" ? 404 : 400;
      return apiFailure(error.code, "无法为该账号开始 Microsoft 重新授权。", status, { requestId });
    }
    return apiFailure("UNAUTHORIZED", "请重新登录。", 401, { requestId });
  }
}
