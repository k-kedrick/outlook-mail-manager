import { z } from "zod";
import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { oauthFlowService } from "@/modules/oauth/composition";
import { OAuthDomainError } from "@/modules/oauth/domain/oauth";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const inputSchema = z.object({
  resource: z.enum(["graph", "outlook_imap"]),
  accountId: z.string().cuid().optional(),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const admin = await requireV2Admin(request, true);
    const input = inputSchema.parse(await request.json());
    const result = await oauthFlowService.start({ adminId: admin.adminId, ...input });
    return apiSuccess(result, { requestId });
  } catch (error) {
    if (error instanceof OAuthDomainError) {
      return apiFailure(error.code, "无法开始 Microsoft 授权。", 400, { requestId });
    }
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "授权参数不正确。", 422, { requestId });
    return apiFailure("UNAUTHORIZED", "请重新登录。", 401, { requestId });
  }
}
