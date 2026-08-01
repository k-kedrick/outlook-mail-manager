export type BatchIssueOutcome = "skipped" | "failed" | "not_found";

export type BatchIssue = {
  id?: string;
  email?: string;
  outcome: BatchIssueOutcome;
  reasonCode: string;
  message: string;
};

export type BatchFeedback = {
  requestId: string;
  requested: number;
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  issues: BatchIssue[];
};

export type BatchFeedbackTone = "success" | "warning" | "danger";

export function batchFeedbackTone(feedback: Pick<BatchFeedback, "failed" | "skipped">): BatchFeedbackTone {
  if (feedback.failed > 0) return "danger";
  if (feedback.skipped > 0) return "warning";
  return "success";
}

export function shouldExpandBatchFeedback(feedback: Pick<BatchFeedback, "failed">): boolean {
  return feedback.failed > 0;
}

export function buildBatchFeedback({
  requestId,
  requested,
  succeeded,
  issues = [],
}: {
  requestId: string;
  requested: number;
  succeeded: number;
  issues?: BatchIssue[];
}): BatchFeedback {
  const failed = issues.filter((issue) => issue.outcome === "failed").length;
  const skipped = issues.length - failed;
  return {
    requestId,
    requested,
    processed: succeeded + skipped + failed,
    succeeded,
    skipped,
    failed,
    issues,
  };
}

export function safeIssueForStatus({
  id,
  email,
  status,
  skipped,
}: {
  id: string;
  email: string;
  status: string;
  skipped?: boolean;
}): BatchIssue | null {
  if (skipped) {
    return { id, email, outcome: "skipped", reasonCode: "THROTTLED", message: "请求过于频繁，已暂时跳过。" };
  }
  if (status === "OK") return null;
  if (status === "AUTH_FAILED") {
    return { id, email, outcome: "failed", reasonCode: "AUTH_FAILED", message: "登录凭据或刷新令牌已失效。" };
  }
  if (status === "LOCKED") {
    return { id, email, outcome: "failed", reasonCode: "ACCOUNT_LOCKED", message: "账号被锁定或拒绝访问。" };
  }
  return { id, email, outcome: "failed", reasonCode: "REMOTE_ERROR", message: "微软服务或网络请求失败。" };
}

export function safeIssueForError(id: string | undefined, email: string | undefined): BatchIssue {
  return {
    id,
    email,
    outcome: "failed",
    reasonCode: "PROCESSING_ERROR",
    message: "处理失败，请使用请求编号查询日志。",
  };
}

export function missingIdIssues(requestedIds: string[] | undefined, foundIds: Iterable<string>): BatchIssue[] {
  if (!requestedIds) return [];
  const found = new Set(foundIds);
  return requestedIds
    .filter((id) => !found.has(id))
    .map((id) => ({
      id,
      outcome: "not_found" as const,
      reasonCode: "ACCOUNT_NOT_FOUND",
      message: "账号不存在或已被删除。",
    }));
}
