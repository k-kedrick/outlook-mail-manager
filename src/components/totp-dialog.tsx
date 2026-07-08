"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
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
};

type RemoveResult = {
  removed: number;
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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const lineCount = useMemo(() => text.split(/\r?\n/).filter((l) => l.trim()).length, [text]);

  async function importTotp(): Promise<void> {
    setLoading("import");
    setError(null);
    setMessage(null);
    setResult(null);
    try {
      const res = await api.post<ImportResult>("/api/accounts/import", { text });
      setResult(res);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setLoading(null);
    }
  }

  async function removeTotp(): Promise<void> {
    if (!ids.length) return;
    if (!confirm(`确认删除选中 ${ids.length} 个账号的身份验证器密钥？此操作不会删除账号。`)) return;
    setLoading("remove");
    setError(null);
    setMessage(null);
    setResult(null);
    try {
      const res = await api.post<RemoveResult>("/api/accounts/totp/unbind", { ids });
      setMessage(`已删除 ${res.removed} 个账号的身份验证器密钥。`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
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

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      {message && (
        <div className="mt-4 rounded-lg border border-line bg-surface2/60 p-3 text-xs text-slate-200">
          {message}
        </div>
      )}
      {result && (
        <div className="mt-4 rounded-lg border border-line bg-surface2/60 p-3 text-xs">
          <p className="text-slate-200">
            补充 / 替换身份验证器 <span className="text-teal">{result.totpUpdated}</span> 个；输入内重复{" "}
            {result.duplicateInInput} 个。
          </p>
          {result.notFound.length > 0 && (
            <p className="mt-1 text-amber-300">
              以下 {result.notFound.length} 个邮箱不存在、无法补充 2FA：{result.notFound.join("、")}
            </p>
          )}
          {result.invalid.length > 0 && (
            <div className="mt-2">
              <p className="text-rose-400">无效行 {result.invalid.length} 条：</p>
              <ul className="mt-1 max-h-40 space-y-1 overflow-auto">
                {result.invalid.map((inv) => (
                  <li key={inv.line} className="text-muted">
                    第 {inv.line} 行：{inv.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
