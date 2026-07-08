"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { fieldBase, fieldClassSm } from "./ui/field";
import type { Group } from "./types";

type ImportResult = {
  created: number;
  updated: number;
  totpUpdated: number;
  notFound: string[];
  total: number;
  duplicateInInput: number;
  invalid: { line: number; raw: string; reason: string }[];
};

export function ImportDialog({
  groups,
  onClose,
  onImported,
}: {
  groups: Group[];
  onClose: () => void;
  onImported: () => void;
}): React.ReactNode {
  const [text, setText] = useState("");
  const [groupId, setGroupId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const lineCount = useMemo(() => text.split(/\r?\n/).filter((l) => l.trim()).length, [text]);

  async function submit(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<ImportResult>("/api/accounts/import", {
        text,
        groupId: groupId || undefined,
      });
      setResult(res);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      title="导入 / 更新邮箱账号"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" onClick={submit} loading={loading} disabled={!text.trim()}>
            开始导入
          </Button>
        </>
      }
    >
      <div className="mb-2 space-y-1 text-xs text-muted">
        <p>每行一个账号，适合批量新增或更新邮箱凭据：</p>
        <p>
          <code className="rounded bg-surface2 px-1.5 py-0.5 text-indigo-300">
            邮箱----密码----ClientId----RefreshToken
          </code>
        </p>
        <p>
          <code className="rounded bg-surface2 px-1.5 py-0.5 text-indigo-300">
            邮箱----密码----ClientId----RefreshToken----身份验证器密钥
          </code>
        </p>
        <p className="text-dim">仅管理身份验证器时，请先选中账号后使用顶部「2FA」。</p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="user@example.com----密码----client-id----refresh-token"
        rows={10}
        className={`w-full resize-y p-3 font-mono text-xs ${fieldBase}`}
      />

      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-muted">检测到 {lineCount} 行</span>
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={fieldClassSm}>
          <option value="">不分组</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              归入分组：{g.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {result && (
        <div className="mt-4 rounded-lg border border-line bg-surface2/60 p-3 text-xs">
          <p className="text-slate-200">
            成功导入 <span className="text-emerald-300">{result.created}</span> 个新账号，更新{" "}
            <span className="text-indigo-300">{result.updated}</span> 个；补充身份验证器{" "}
            <span className="text-teal">{result.totpUpdated}</span> 个；输入内重复{" "}
            {result.duplicateInInput} 个。
          </p>
          {result.notFound.length > 0 && (
            <p className="mt-1 text-amber-300">
              以下 {result.notFound.length} 个邮箱未导入、无法补充 2FA：{result.notFound.join("、")}
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
