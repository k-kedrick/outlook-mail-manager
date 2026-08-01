import { ok, requestId, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { buildBatchFeedback, missingIdIssues } from "@/lib/batch-feedback";
import { prisma } from "@/lib/prisma";
import { bulkIdsSchema } from "@/lib/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const { ids } = bulkIdsSchema.parse(await request.json());
    const accounts = await prisma.mailAccount.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const result = await prisma.mailAccount.deleteMany({ where: { id: { in: ids } } });
    return ok({
      deleted: result.count,
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
