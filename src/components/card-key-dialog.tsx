"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { fieldClass } from "./ui/field";

type GenerateResult = {
  generated: number;
  regenerated: number;
  skipped: number;
  total: number;
};

type UnbindResult = {
  unbound: number;
};

export function CardKeyDialog({
  ids,
  onClose,
  onDone,
}: {
  ids: string[];
  onClose: () => void;
  onDone: () => void;
}): React.ReactNode {
  const [prefix, setPrefix] = useState("");
  const [regenerate, setRegenerate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.post<GenerateResult>("/api/cardkeys/generate", {
        ids,
        prefix: prefix.trim(),
        regenerate,
      });
      setResult(res);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function unbind(): Promise<void> {
    if (!ids.length) return;
    if (!confirm(`确认删除选中 ${ids.length} 个账号的卡密？此操作不会删除账号。`)) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setMessage(null);
    try {
      const res = await api.post<UnbindResult>("/api/cardkeys/unbind", { ids });
      setMessage(`已删除 / 解绑 ${res.unbound} 个账号的卡密。`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      title={`卡密管理（已选 ${ids.length} 个账号）`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button variant="danger" onClick={unbind} loading={loading}>
            删除所选卡密
          </Button>
          <Button variant="primary" onClick={submit} loading={loading}>
            生成
          </Button>
        </>
      }
    >
      <label className="mb-1 block text-xs text-muted">卡密前缀（可自定义，可留空）</label>
      <input
        value={prefix}
        onChange={(e) => setPrefix(e.target.value)}
        placeholder="VIP"
        maxLength={20}
        className={`w-full ${fieldClass}`}
      />
      <p className="mt-2 text-xs text-dim">
        预览：
        <code className="ml-1 rounded bg-surface2 px-1.5 py-0.5 font-mono text-indigo-300">
          {prefix.trim() ? `${prefix.trim()}-XXXXXXXX` : "XXXXXXXX"}
        </code>
        <span className="ml-1">（- 后为 8 位大写字母+数字随机段）</span>
      </p>

      <label className="mt-4 flex items-center gap-2 text-xs text-slate-200">
        <input
          type="checkbox"
          checked={regenerate}
          onChange={(e) => setRegenerate(e.target.checked)}
          className="accent-accent"
        />
        覆盖已有卡密（对已绑定的账号重新生成新卡密）
      </label>
      {!regenerate && (
        <p className="mt-1 text-[11px] text-dim">未勾选时，已绑定卡密的账号会被跳过。</p>
      )}

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      {message && (
        <div className="mt-4 rounded-lg border border-line bg-surface2/60 p-3 text-xs text-slate-200">
          {message}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-lg border border-line bg-surface2/60 p-3 text-xs text-slate-200">
          新生成 <span className="text-emerald-300">{result.generated}</span> 个，重新生成{" "}
          <span className="text-indigo-300">{result.regenerated}</span> 个，跳过{" "}
          <span className="text-amber-300">{result.skipped}</span> 个。
        </div>
      )}
    </Dialog>
  );
}
