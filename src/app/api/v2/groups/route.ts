import { z } from "zod";
import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { groupService } from "@/modules/groups/composition";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const schema = z.object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional() });

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request);
    return apiSuccess(await groupService.list(), { requestId });
  } catch {
    return apiFailure("UNAUTHORIZED", "请重新登录。", 401, { requestId });
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request, true);
    return apiSuccess(await groupService.create(schema.parse(await request.json())), { requestId, status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "分组参数不正确。", 422, { requestId });
    return apiFailure("GROUP_CREATE_FAILED", "分组创建失败。", 409, { requestId });
  }
}
