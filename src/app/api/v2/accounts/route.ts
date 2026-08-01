import { z } from "zod";
import { accountAdminService } from "@/modules/accounts/composition";
import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const schema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().cuid().optional(),
  query: z.string().max(320).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request);
    const url = new URL(request.url);
    const input = schema.parse(Object.fromEntries(url.searchParams));
    return apiSuccess(await accountAdminService.list(input), { requestId });
  } catch (error) {
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "账号查询参数不正确。", 422, { requestId });
    return apiFailure("UNAUTHORIZED", "请重新登录。", 401, { requestId });
  }
}
