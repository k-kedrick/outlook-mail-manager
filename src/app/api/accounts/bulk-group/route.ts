import { fail, ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bulkGroupSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Assign selected accounts to a group, or clear their group when groupId is null.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const { ids, groupId } = bulkGroupSchema.parse(await request.json());

    if (groupId) {
      const group = await prisma.mailGroup.findUnique({
        where: { id: groupId },
        select: { id: true },
      });
      if (!group) return fail("分组不存在。", 404);
    }

    const result = await prisma.mailAccount.updateMany({
      where: { id: { in: ids } },
      data: { groupId },
    });

    return ok({ updated: result.count });
  } catch (error) {
    return routeError(error);
  }
}
