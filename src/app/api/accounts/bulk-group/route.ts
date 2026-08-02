import { fail, ok, requestId, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { buildBatchFeedback, missingIdIssues } from "@/lib/batch-feedback";
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

    const accounts = await prisma.mailAccount.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const result = await prisma.mailAccount.updateMany({
      where: { id: { in: ids } },
      data: { groupId },
    });

    return ok({
      updated: result.count,
      feedback: buildBatchFeedback({
        requestId: requestId(),
        requested: ids.length,
        succeeded: result.count,
        issues: missingIdIssues(ids, accounts.map((account) => account.id)),
      }),
    });
  } catch (error) {
    return routeError(error);
  }
}
