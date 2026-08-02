import { describe, expect, it } from "vitest";
import {
  batchFeedbackTone,
  buildBatchFeedback,
  missingIdIssues,
  safeIssueForError,
  safeIssueForStatus,
  shouldExpandBatchFeedback,
} from "./batch-feedback";

describe("batch feedback", () => {
  it("derives complete counters and visual state", () => {
    const feedback = buildBatchFeedback({
      requestId: "request-1",
      requested: 3,
      succeeded: 1,
      issues: [
        { outcome: "skipped", reasonCode: "NO_CODE", message: "未找到验证码。" },
        { outcome: "failed", reasonCode: "REMOTE_ERROR", message: "远程请求失败。" },
      ],
    });
    expect(feedback).toMatchObject({ processed: 3, succeeded: 1, skipped: 1, failed: 1 });
    expect(batchFeedbackTone(feedback)).toBe("danger");
    expect(shouldExpandBatchFeedback(feedback)).toBe(true);
  });

  it("uses success and warning tones without auto-expanding skipped details", () => {
    expect(batchFeedbackTone({ failed: 0, skipped: 0 })).toBe("success");
    expect(batchFeedbackTone({ failed: 0, skipped: 1 })).toBe("warning");
    expect(shouldExpandBatchFeedback({ failed: 0 })).toBe(false);
  });

  it("maps statuses and internal errors to fixed public messages", () => {
    expect(safeIssueForStatus({ id: "a", email: "a@example.com", status: "AUTH_FAILED" })).toMatchObject({
      reasonCode: "AUTH_FAILED",
      outcome: "failed",
    });
    expect(safeIssueForStatus({ id: "b", email: "b@example.com", status: "OK", skipped: true })).toMatchObject({
      reasonCode: "THROTTLED",
      outcome: "skipped",
    });
    expect(JSON.stringify(safeIssueForError("a", "a@example.com"))).not.toContain("token");
  });

  it("reports requested ids that were not found", () => {
    expect(missingIdIssues(["a", "b"], ["a"])).toEqual([
      expect.objectContaining({ id: "b", outcome: "not_found", reasonCode: "ACCOUNT_NOT_FOUND" }),
    ]);
  });
});
