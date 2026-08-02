"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import type { BatchFeedback } from "@/lib/batch-feedback";
import { Button } from "./ui/button";
import { BatchResultBanner, failedBatchResult, type BatchResult } from "./ui/batch-result";
import { Dialog } from "./ui/dialog";
import { fieldBase } from "./ui/field";

type ImportResult = {
  created: number;
  updated: number;
  totpUpdated: number;
  notFound: string[];
  total: number;
  duplicateInInput: number;
  invalid: { line: number; raw: string; reason: string }[];
  feedback: BatchFeedback;
};

type RemoveResult = {
  removed: number;
  feedback: BatchFeedback;
};

export function TotpDialog({
  ids,
  onClose,
  onDone,
}: {
  ids: string[];
  onClose: () => void;
  onDone: () => void;
}): React.ReactNode {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);

  const lineCount = useMemo(() => text.split(/\r?\n/).filter((l) => l.trim()).length, [text]);

  async function importTotp(): Promise<void> {
    setLoading("import");
    setResult(null);
    try {
      const res = await api.post<ImportResult>("/api/accounts/import", { text });
      setResult({ ...res.feedback, title: "身份验证器导入完成", completedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }) });
      onDone();
    } catch (e) {
      setResult(failedBatchResult("身份验证器导入失败", lineCount, e));
    } finally {
      setLoading(null);
    }
  }

  async function removeTotp(): Promise<void> {
    if (!ids.length) return;
    if (!confirm(`确认删除选中 ${ids.length} 个账号的身份验证器密钥？此操作不会删除账号。`)) return;
    setLoading("remove");
    setResult(null);
    try {
      const res = await api.post<RemoveResult>("/api/accounts/totp/unbind", { ids });
      setResult({ ...res.feedback, title: "身份验证器解绑完成", completedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }) });
      onDone();
    } catch (e) {
      setResult(failedBatchResult("身份验证器解绑失败", ids.length, e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <Dialog
      title={`批量管理身份验证器（已选 ${ids.length} 个账号）`}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button variant="danger" onClick={removeTotp} loading={loading === "remove"} disabled={!ids.length}>
            删除所选 2FA
          </Button>
          <Button variant="primary" onClick={importTotp} loading={loading === "import"} disabled={!text.trim()}>
            添加 / 替换 2FA
          </Button>
        </>
      }
    >
      <div className="mb-2 space-y-1 text-xs text-muted">
        <p>这里专门管理 2FA 身份验证器：添加/替换密钥，或删除所选账号的密钥。</p>
        <p>
          <code className="rounded bg-surface2 px-1.5 py-0.5 text-teal">邮箱----身份验证器密钥</code>
        </p>
        <p>这些操作只修改 2FA 密钥，不影响账号、卡密、邮箱验证码或 RefreshToken。</p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="user@example.com----JBSWY3DPEHPK3PXP"
        rows={8}
        className={`w-full resize-y p-3 font-mono text-xs ${fieldBase}`}
      />
      <p className="mt-2 text-xs text-muted">检测到 {lineCount} 行</p>

      {result && <div className="mt-4"><BatchResultBanner result={result} onClose={() => setResult(null)} /></div>}
    </Dialog>
  );
}
