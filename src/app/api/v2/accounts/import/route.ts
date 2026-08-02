import { z } from "zod";
import { importAccountsService } from "@/modules/accounts/composition";
import { requireV2Admin, requestClientContext } from "@/modules/auth/presentation/next-auth";
import { jobRepository } from "@/modules/jobs/composition";
import { JOB_TYPES } from "@/modules/jobs/domain/job";
import { recordAudit } from "@/shared/audit/audit";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const schema = z.object({ text: z.string().min(1).max(5_000_000), groupId: z.string().cuid().optional() });

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const admin = await requireV2Admin(request, true);
    const input = schema.parse(await request.json());
    const result = await importAccountsService.execute(input.text, input.groupId);
    for (const account of result.accounts) {
      await jobRepository.enqueue({
        type: JOB_TYPES.CAPABILITY_PROBE,
        accountId: account.id,
        payload: {},
        dedupeKey: `import-probe:${account.id}`,
        priority: 5,
      });
    }
    await recordAudit({
      adminId: admin.adminId,
      action: "accounts.import",
      targetType: "MailAccount",
      outcome: result.failed.length ? "FAILED" : "SUCCEEDED",
      requestId,
      ip: requestClientContext(request).ip,
      metadata: {
        requested: result.requested,
        created: result.created,
        updated: result.updated,
        failed: result.failed.length,
      },
    });
    return apiSuccess(result, { requestId });
  } catch (error) {
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "导入内容格式不正确。", 422, { requestId });
    return apiFailure("IMPORT_FAILED", "账号导入失败。", 500, { requestId });
  }
}
