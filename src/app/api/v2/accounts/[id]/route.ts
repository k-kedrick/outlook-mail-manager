import { z } from "zod";
import { accountAdminService } from "@/modules/accounts/composition";
import { AccountNotFoundError } from "@/modules/accounts/domain/account-admin";
import { requireV2Admin, requestClientContext } from "@/modules/auth/presentation/next-auth";
import { recordAudit } from "@/shared/audit/audit";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const patchSchema = z.object({
  groupId: z.string().cuid().nullable().optional(),
  preferredProtocol: z.enum(["graph", "imap", "outlook_rest_legacy"]).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const admin = await requireV2Admin(request, true);
    const { id } = await context.params;
    const input = patchSchema.parse(await request.json());
    const account = await accountAdminService.update(id, input);
    await recordAudit({ adminId: admin.adminId, action: "account.update", targetType: "MailAccount", targetId: id, outcome: "SUCCEEDED", requestId, ip: requestClientContext(request).ip });
    return apiSuccess(account, { requestId });
  } catch (error) {
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "账号更新参数不正确。", 422, { requestId });
    if (error instanceof AccountNotFoundError) return apiFailure("ACCOUNT_NOT_FOUND", "账号不存在。", 404, { requestId });
    return apiFailure("ACCOUNT_UPDATE_FAILED", "账号更新失败。", 500, { requestId });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const admin = await requireV2Admin(request, true);
    const { id } = await context.params;
    const deleted = await accountAdminService.delete(id);
    await recordAudit({ adminId: admin.adminId, action: "account.delete", targetType: "MailAccount", targetId: id, outcome: "SUCCEEDED", requestId, ip: requestClientContext(request).ip, metadata: { email: deleted.email } });
    return apiSuccess({ deleted: true }, { requestId });
  } catch (error) {
    if (error instanceof AccountNotFoundError) return apiFailure("ACCOUNT_NOT_FOUND", "账号不存在。", 404, { requestId });
    return apiFailure("ACCOUNT_DELETE_FAILED", "账号删除失败或账号不存在。", 404, { requestId });
  }
}
