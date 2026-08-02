import { logPublicError, ok, requestId, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { buildBatchFeedback, missingIdIssues, safeIssueForError, type BatchIssue } from "@/lib/batch-feedback";
import { prisma } from "@/lib/prisma";
import { fetchAndStoreCodes } from "@/lib/outlook/code-service";
import { bulkIdsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

// Bulk-fetch latest verification codes. With ids → those; without → all OK accounts.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({}));

    let ids: string[] | undefined;
    if (body && Array.isArray(body.ids) && body.ids.length > 0) {
      ids = bulkIdsSchema.parse(body).ids;
    }

    const accounts = await prisma.mailAccount.findMany({
      where: ids ? { id: { in: ids } } : { status: "OK" },
    });

    const results = await fetchAndStoreCodes(accounts, 5);
    const withCode = results.filter((r) => r.code).length;
    const id = requestId();
    const issues: BatchIssue[] = results.flatMap((result) => {
      if (result.error) {
        logPublicError("fetch-codes", id, new Error(result.error), "MAIL_READ_ERROR", result.id);
        return [safeIssueForError(result.id, result.email)];
      }
      if (!result.code) {
        return [{ id: result.id, email: result.email, outcome: "skipped", reasonCode: "NO_CODE", message: "未找到符合条件的验证码。" }];
      }
      return [];
    });
    issues.push(...missingIdIssues(ids, accounts.map((account) => account.id)));
    return ok({
      fetched: results.length,
      withCode,
      results: results.map((result) => ({ ...result, error: result.error ? "处理失败，请使用请求编号查询日志。" : null })),
      feedback: buildBatchFeedback({
        requestId: id,
        requested: ids?.length ?? accounts.length,
        succeeded: withCode,
        issues,
      }),
    });
  } catch (error) {
    return routeError(error);
  }
}
