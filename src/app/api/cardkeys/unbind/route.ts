import { ok, requestId, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { buildBatchFeedback, missingIdIssues, type BatchIssue } from "@/lib/batch-feedback";
import { prisma } from "@/lib/prisma";
import { bulkIdsSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Remove the card-key binding from the given accounts.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const { ids } = bulkIdsSchema.parse(await request.json());
    const accounts = await prisma.mailAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, cardKey: { select: { id: true } } },
    });
    const issues: BatchIssue[] = missingIdIssues(ids, accounts.map((account) => account.id));
    issues.push(...accounts.filter((account) => !account.cardKey).map((account) => ({
      id: account.id,
      email: account.email,
      outcome: "skipped" as const,
      reasonCode: "NO_CARD_KEY",
      message: "账号原本没有绑定卡密。",
    })));
    const result = await prisma.cardKey.deleteMany({ where: { accountId: { in: ids } } });
    return ok({
      unbound: result.count,
      feedback: buildBatchFeedback({ requestId: requestId(), requested: ids.length, succeeded: result.count, issues }),
    });
  } catch (error) {
    return routeError(error);
  }
}
