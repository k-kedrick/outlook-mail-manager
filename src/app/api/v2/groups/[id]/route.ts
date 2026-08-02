import { z } from "zod";
import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { groupService } from "@/modules/groups/composition";
import { GroupNotFoundError } from "@/modules/groups/domain/group";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const schema = z.object({ name: z.string().trim().min(1).max(80).optional(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(), sortOrder: z.number().int().optional() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request, true);
    const { id } = await context.params;
    return apiSuccess(await groupService.update(id, schema.parse(await request.json())), { requestId });
  } catch (error) {
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "分组更新参数不正确。", 422, { requestId });
    if (error instanceof GroupNotFoundError) return apiFailure("GROUP_NOT_FOUND", "分组不存在。", 404, { requestId });
    return apiFailure("GROUP_UPDATE_FAILED", "分组更新失败。", 409, { requestId });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request, true);
    const { id } = await context.params;
    await groupService.delete(id);
    return apiSuccess({ deleted: true }, { requestId });
  } catch (error) {
    if (error instanceof GroupNotFoundError) return apiFailure("GROUP_NOT_FOUND", "分组不存在。", 404, { requestId });
    return apiFailure("GROUP_DELETE_FAILED", "分组删除失败。", 404, { requestId });
  }
}
