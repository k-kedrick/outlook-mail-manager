"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, X } from "lucide-react";
import { batchFeedbackTone, shouldExpandBatchFeedback, type BatchFeedback } from "@/lib/batch-feedback";
import { ApiError } from "@/lib/client";

export type BatchResult = BatchFeedback & { title: string; completedAt: string };

export function failedBatchResult(title: string, requested: number, error: unknown): BatchResult {
  const safeRequested = Math.max(1, requested);
  const requestId = error instanceof ApiError && error.requestId ? error.requestId : crypto.randomUUID();
  const message = error instanceof ApiError ? error.message : "请求处理失败，请稍后重试。";
  return {
    title,
    requestId,
    requested: safeRequested,
    processed: 0,
    succeeded: 0,
    skipped: 0,
    failed: safeRequested,
    issues: [{ outcome: "failed", reasonCode: "REQUEST_FAILED", message }],
    completedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
  };
}

export function BatchResultBanner({ result, onClose }: { result: BatchResult; onClose: () => void }): React.ReactNode {
  const [expanded, setExpanded] = useState(shouldExpandBatchFeedback(result));
  const tone = batchFeedbackTone(result);
  const styles = {
    success: "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
    warning: "border-amber-500/35 bg-amber-500/10 text-amber-100",
    danger: "border-rose-500/40 bg-rose-500/10 text-rose-100",
  }[tone];
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;

  return (
    <section className={`mb-3 overflow-hidden rounded-lg border ${styles}`} role="status">
      <div className="flex min-h-11 items-center gap-2 px-3 py-2 text-xs">
        <Icon size={15} className="shrink-0" />
        <span className="font-semibold">{result.title}</span>
        <span className="text-slate-300">请求 {result.requested}</span>
        <span className="text-emerald-300">成功 {result.succeeded}</span>
        <span className="text-amber-300">跳过 {result.skipped}</span>
        <span className="text-rose-300">失败 {result.failed}</span>
        <span className="ml-auto text-dim">{result.completedAt}</span>
        {result.issues.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-slate-300 hover:bg-white/5 hover:text-white"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? "收起" : "查看详情"}
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="关闭结果提示" className="rounded p-1 text-muted hover:bg-white/5 hover:text-white">
          <X size={14} />
        </button>
      </div>
      {expanded && result.issues.length > 0 && (
        <div className="max-h-56 overflow-auto border-t border-current/10 px-3 py-2">
          <ul className="space-y-1.5 text-xs">
            {result.issues.map((issue, index) => (
              <li key={`${issue.id ?? issue.email ?? "issue"}-${index}`} className="grid grid-cols-[minmax(180px,1fr)_90px_2fr] gap-3 rounded bg-black/10 px-2 py-1.5">
                <span className="truncate text-slate-200" title={issue.email ?? issue.id}>{issue.email ?? issue.id ?? "输入项"}</span>
                <span className={issue.outcome === "failed" ? "text-rose-300" : "text-amber-300"}>
                  {issue.outcome === "failed" ? "失败" : issue.outcome === "not_found" ? "不存在" : "跳过"}
                </span>
                <span className="text-slate-300">{issue.message}</span>
              </li>
            ))}
          </ul>
          {result.failed > 0 && <p className="mt-2 text-[11px] text-dim">请求编号：{result.requestId}</p>}
        </div>
      )}
    </section>
  );
}
