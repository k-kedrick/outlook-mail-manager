"use client";

import { useState } from "react";
import { buildBatchFeedback } from "@/lib/batch-feedback";
import { Button } from "./ui/button";
import { BatchResultBanner, type BatchResult } from "./ui/batch-result";
import { Dialog } from "./ui/dialog";

// Fixed output order — checked columns are emitted in this order, joined by "----".
const COLUMNS: { key: string; label: string }[] = [
  { key: "email", label: "账号" },
  { key: "password", label: "密码" },
  { key: "clientId", label: "ClientId" },
  { key: "refreshToken", label: "刷新令牌" },
  { key: "cardKey", label: "卡密" },
  { key: "totp", label: "身份验证器密钥" },
];

export function ExportDialog({
  ids,
  onClose,
}: {
  ids: string[];
  onClose: () => void;
}): React.ReactNode {
  // Default to the standard 4-field import format.
  const [checked, setChecked] = useState<Record<string, boolean>>({
    email: true,
    password: true,
    clientId: true,
    refreshToken: true,
    cardKey: false,
    totp: false,
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);

  const selectedFields = COLUMNS.filter((c) => checked[c.key]).map((c) => c.key);
  const hasSensitiveFields = Boolean(checked.refreshToken || checked.totp);

  async function exportNow(): Promise<void> {
    if (!selectedFields.length || !ids.length) return;
    setLoading(true);
    setResult(null);
    const params = new URLSearchParams();
    params.set("ids", ids.join(","));
    params.set("fields", selectedFields.join(","));
    let responseRequestId: string | null = null;
    try {
      const response = await fetch(`/api/accounts/export?${params.toString()}`);
      const requestId = response.headers.get("X-Request-Id") ?? crypto.randomUUID();
      responseRequestId = requestId;
      if (!response.ok) throw new Error("EXPORT_FAILED");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `accounts-${Date.now()}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      const exported = Number(response.headers.get("X-Exported-Count") ?? ids.length);
      const missing = Math.max(0, ids.length - exported);
      const issues = Array.from({ length: missing }, (_, index) => ({
        id: `missing-${index + 1}`,
        outcome: "not_found" as const,
        reasonCode: "ACCOUNT_NOT_FOUND",
        message: "账号不存在或已删除。",
      }));
      setResult({
        ...buildBatchFeedback({ requestId, requested: ids.length, succeeded: exported, issues }),
        title: "账号导出完成",
        completedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      });
    } catch {
      const requestId = responseRequestId ?? crypto.randomUUID();
      setResult({
        ...buildBatchFeedback({
          requestId,
          requested: ids.length,
          succeeded: 0,
          issues: [{ outcome: "failed", reasonCode: "EXPORT_FAILED", message: "导出失败，请使用请求编号查询日志。" }],
        }),
        title: "账号导出失败",
        completedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      title={`导出账号信息（已选 ${ids.length} 个）`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={exportNow} loading={loading} disabled={!selectedFields.length}>
            导出
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-muted">
        勾选要导出的字段，按固定顺序用 <code className="rounded bg-surface2 px-1 text-indigo-300">----</code> 拼接；某字段为空则该位置输出{" "}
        <code className="rounded bg-surface2 px-1 text-rose-300">error</code>。导出按邮箱升序排列。
      </p>
      {hasSensitiveFields && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          当前包含 RefreshToken 或身份验证器密钥，导出内容可直接控制账号或生成 2FA 动态码，请只在可信环境保存。
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {COLUMNS.map((c) => (
          <label
            key={c.key}
            className="flex items-center gap-2 rounded-lg border border-line bg-surface2/40 px-3 py-2 text-sm text-slate-100"
          >
            <input
              type="checkbox"
              className="accent-accent"
              checked={checked[c.key]}
              onChange={(e) => setChecked((prev) => ({ ...prev, [c.key]: e.target.checked }))}
            />
            {c.label}
          </label>
        ))}
      </div>
      {result && <div className="mt-4"><BatchResultBanner result={result} onClose={() => setResult(null)} /></div>}
    </Dialog>
  );
}
