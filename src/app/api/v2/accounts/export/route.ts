import { z } from "zod";
import { accountAdminService } from "@/modules/accounts/composition";
import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const schema = z.object({ accountIds: z.array(z.string().cuid()).min(1).max(10_000) });

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request, true);
    const { accountIds } = schema.parse(await request.json());
    return apiSuccess(await accountAdminService.export(accountIds), { requestId });
  } catch (error) {
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "导出账号参数不正确。", 422, { requestId });
    return apiFailure("EXPORT_FAILED", "账号导出失败。", 500, { requestId });
  }
}
