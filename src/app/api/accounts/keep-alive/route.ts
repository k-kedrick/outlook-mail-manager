import { logPublicError, ok, requestId, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { buildBatchFeedback, missingIdIssues, safeIssueForStatus } from "@/lib/batch-feedback";
import { runKeepAlive } from "@/lib/outlook/keep-alive";
import { bulkIdsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

// Manually renew (rotate) refresh tokens. With ids → only those; without → all.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({}));

    let ids: string[] | undefined;
    if (body && Array.isArray(body.ids) && body.ids.length > 0) {
      ids = bulkIdsSchema.parse(body).ids;
    }

    const id = requestId();
    const result = await runKeepAlive({ ids });
    const issues = [
      ...result.results.map(safeIssueForStatus).filter((issue) => issue !== null),
      ...missingIdIssues(ids, result.results.map((entry) => entry.id)),
    ];
    for (const issue of issues.filter((entry) => entry.outcome === "failed")) {
      logPublicError("keep-alive", id, new Error(issue.reasonCode), issue.reasonCode, issue.id);
    }
    const safeResults = result.results.map((entry) => {
      const issue = safeIssueForStatus(entry);
      return { ...entry, error: issue?.message ?? null };
    });
    return ok({
      ...result,
      results: safeResults,
      feedback: buildBatchFeedback({
        requestId: id,
        requested: ids?.length ?? result.checked,
        succeeded: result.refreshed,
        issues,
      }),
    });
  } catch (error) {
    return routeError(error);
  }
}
