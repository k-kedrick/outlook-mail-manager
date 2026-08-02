"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, KeyRound, Mail, RefreshCw, Smartphone, Ticket } from "lucide-react";

type Identity = { email: string; has2fa: boolean };
type CodeResult = { code: string | null; codeAt: string | null; subject: string | null; from: string | null };
type TotpResult = { totp: string | null; secondsRemaining?: number };

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

async function postRedeem<T>(path: string, code: string): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? "请求失败");
  return data as T;
}

function CopyField({ value, label }: { value: string; label: string }): React.ReactNode {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title={`点击复制${label}`}
      className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-indigo-300"
    >
      <Copy size={14} />
      {copied && <span className="text-[10px] text-emerald-300">已复制</span>}
    </button>
  );
}

export default function RedeemPage(): React.ReactNode {
  const [code, setCode] = useState("");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [emailCode, setEmailCode] = useState<CodeResult | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [totp, setTotp] = useState<{ code: string; secondsRemaining: number } | null>(null);

  const activeCode = useRef("");

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const id = await postRedeem<Identity>("/api/redeem", code.trim());
      activeCode.current = code.trim();
      setIdentity(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "卡密验证失败");
    } finally {
      setLoading(false);
    }
  }

  const fetchEmailCode = useCallback(async (): Promise<void> => {
    setCodeBusy(true);
    setCodeError(null);
    try {
      const r = await postRedeem<CodeResult>("/api/redeem/code", activeCode.current);
      setEmailCode(r);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "获取验证码失败");
    } finally {
      setCodeBusy(false);
    }
  }, []);

  // On unlock: pull the latest email code once.
  useEffect(() => {
    if (identity) void fetchEmailCode();
  }, [identity, fetchEmailCode]);

  // Live TOTP: fetch, tick down, refetch on rollover.
  // Pause rollover requests while hidden; refresh once when the tab becomes visible.
  useEffect(() => {
    if (!identity?.has2fa) {
      setTotp(null);
      return;
    }
    let active = true;
    const load = async (): Promise<void> => {
      if (document.hidden) return;
      try {
        const r = await postRedeem<TotpResult>("/api/redeem/totp", activeCode.current);
        if (active && r.totp) setTotp({ code: r.totp, secondsRemaining: r.secondsRemaining ?? 30 });
      } catch {
        /* ignore; next tick retries */
      }
    };
    void load();
    const timer = setInterval(() => {
      setTotp((cur) => {
        if (document.hidden) return cur;
        if (!cur) return cur;
        const next = cur.secondsRemaining - 1;
        if (next <= 0) {
          void load();
          return { ...cur, secondsRemaining: 0 };
        }
        return { ...cur, secondsRemaining: next };
      });
    }, 1000);
    const onVisibilityChange = (): void => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [identity?.has2fa]);

  if (!identity) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <form
          onSubmit={submit}
          className="w-full max-w-sm rounded-2xl border border-line bg-surface/80 p-8 shadow-glow"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-teal/15 p-2.5 text-teal shadow-glow-teal">
              <Ticket size={22} />
            </div>
            <div>
              <h1 className="text-glow-title text-lg font-semibold">卡密兑换</h1>
              <p className="text-xs text-muted">输入卡密以获取账号验证码</p>
            </div>
          </div>

          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="请输入卡密"
            autoFocus
            className="mb-3 h-10 w-full rounded-lg border border-line2 bg-surface2 px-3 font-mono text-sm text-slate-100 outline-none transition-colors placeholder:text-dim focus:border-accent focus:ring-2 focus:ring-accent/20"
          />

          {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="h-10 w-full rounded-lg bg-accent text-sm font-medium text-white shadow-sm transition-all hover:bg-accent-600 hover:shadow-glow disabled:opacity-50"
          >
            {loading ? "验证中…" : "进入"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal/15 text-teal shadow-glow-teal">
          <Ticket size={18} />
        </span>
        <h1 className="text-glow-title text-xl font-semibold">卡密兑换</h1>
      </div>

      <div className="space-y-4">
        {/* 对应邮箱 */}
        <section className="rounded-xl border border-line bg-surface shadow-card">
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">对应邮箱</h2>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <span className="flex items-center gap-2 text-sm text-slate-100">
              <Mail size={15} className="text-muted" />
              {identity.email}
            </span>
            <CopyField value={identity.email} label="邮箱" />
          </div>
        </section>

        {/* 邮箱验证码 + 时间 */}
        <section className="rounded-xl border border-line bg-surface shadow-card">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">邮箱验证码</h2>
            <button
              onClick={() => void fetchEmailCode()}
              disabled={codeBusy}
              className="inline-flex items-center gap-1.5 text-xs text-indigo-300 transition-colors hover:text-indigo-200 disabled:opacity-50"
            >
              <RefreshCw size={13} className={codeBusy ? "animate-spin" : ""} /> 获取 / 刷新
            </button>
          </div>
          <div className="px-5 py-4">
            {codeError ? (
              <p className="text-sm text-rose-400">{codeError}</p>
            ) : emailCode?.code ? (
              <button
                onClick={async () => navigator.clipboard.writeText(emailCode.code!)}
                title="点击复制验证码"
                className="flex items-center gap-3 transition-opacity hover:opacity-80"
              >
                <KeyRound size={16} className="text-muted" />
                <span className="font-mono text-2xl tracking-widest text-emerald-300">{emailCode.code}</span>
                <Copy size={14} className="text-muted" />
              </button>
            ) : (
              <p className="text-sm text-muted">{codeBusy ? "读取中…" : "收件箱与垃圾邮件中暂未找到验证码。"}</p>
            )}
            <p className="mt-2 text-xs text-dim">验证码时间：{fmt(emailCode?.codeAt ?? null)}</p>
          </div>
        </section>

        {/* 身份验证器验证码 */}
        <section className="rounded-xl border border-line bg-surface shadow-card">
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">身份验证器验证码</h2>
          </div>
          <div className="px-5 py-4">
            {!identity.has2fa ? (
              <p className="font-mono text-lg text-dim">----</p>
            ) : totp ? (
              <button
                onClick={async () => navigator.clipboard.writeText(totp.code)}
                title="点击复制验证码"
                className="flex items-center gap-3 transition-opacity hover:opacity-80"
              >
                <Smartphone size={16} className="text-muted" />
                <span className="font-mono text-2xl tracking-widest text-emerald-300">{totp.code}</span>
                <span className="text-sm text-amber-300">| {totp.secondsRemaining}s</span>
                <Copy size={14} className="text-muted" />
              </button>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <RefreshCw size={13} className="animate-spin" /> 计算中…
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
