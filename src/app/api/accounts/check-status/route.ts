import { logPublicError, ok, requestId, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { buildBatchFeedback, missingIdIssues, safeIssueForStatus } from "@/lib/batch-feedback";
import { prisma } from "@/lib/prisma";
import { verifyStatuses } from "@/lib/outlook/health";
import { bulkIdsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

// Read-only status probe (reuses cached tokens, does NOT rotate refresh tokens).
// With ids → those; without → all non-dead accounts.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({}));

    let ids: string[] | undefined;
    if (body && Array.isArray(body.ids) && body.ids.length > 0) {
      ids = bulkIdsSchema.parse(body).ids;
    }

    const accounts = await prisma.mailAccount.findMany({
      where: ids ? { id: { in: ids } } : { status: { not: "AUTH_FAILED" } },
    });

    const id = requestId();
    const results = await verifyStatuses(accounts, 5);
    const summary = results.reduce<Record<string, number>>((acc, r) => {
      const key = r.skipped ? "SKIPPED" : r.status;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const issues = [
      ...results.map(safeIssueForStatus).filter((issue) => issue !== null),
      ...missingIdIssues(ids, accounts.map((account) => account.id)),
    ];
    const safeResults = results.map((result) => {
      const issue = safeIssueForStatus(result);
      return { ...result, error: issue?.message ?? null };
    });
    for (const issue of issues.filter((entry) => entry.outcome === "failed")) {
      logPublicError("check-status", id, new Error(issue.reasonCode), issue.reasonCode, issue.id);
    }
    return ok({
      checked: results.length,
      summary,
      results: safeResults,
      feedback: buildBatchFeedback({
        requestId: id,
        requested: ids?.length ?? accounts.length,
        succeeded: results.filter((result) => !safeIssueForStatus(result)).length,
        issues,
      }),
    });
  } catch (error) {
    return routeError(error);
  }
}
