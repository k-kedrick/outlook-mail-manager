import { accountAdminService } from "@/modules/accounts/composition";
import { AccountNotFoundError } from "@/modules/accounts/domain/account-admin";
import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request, true);
    const { id } = await context.params;
    return apiSuccess(await accountAdminService.reveal(id), { requestId });
  } catch (error) {
    if (error instanceof AccountNotFoundError) return apiFailure("ACCOUNT_NOT_FOUND", "账号不存在。", 404, { requestId });
    return apiFailure("REVEAL_FAILED", "敏感凭据读取失败。", 500, { requestId });
  }
}
