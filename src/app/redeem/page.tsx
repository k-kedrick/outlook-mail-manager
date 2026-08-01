"use client";

import { Copy, KeyRound, Mail, RefreshCw, Smartphone, Ticket } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, ApiClientError } from "@/features/api/client";

type RequestCredential = { requestId: string; retrievalToken: string; pollAfterMs: number; email: string; hasTotp: boolean; expiresAt: string };
type CodeStatus = { status: "pending" | "running" | "found" | "expired" | "failed"; code: string | null; subject: string | null; from: string | null; receivedAt: string | null; errorCode: string | null; expiresAt: string };
type Totp = { totp: string | null; secondsRemaining?: number; period?: number };

export default function RedeemPage(): React.ReactNode {
  const [cardKey, setCardKey] = useState("");
  const activeKey = useRef("");
  const [credential, setCredential] = useState<RequestCredential | null>(null);
  const [status, setStatus] = useState<CodeStatus | null>(null);
  const [totp, setTotp] = useState<Totp | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRequest = useCallback(async (key: string): Promise<void> => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const next = await apiRequest<RequestCredential>("/api/v2/redemptions/code-requests", { method: "POST", body: JSON.stringify({ cardKey: key }) });
      activeKey.current = key;
      setCredential(next);
      if (next.hasTotp) setTotp(await apiRequest<Totp>("/api/v2/redemptions/totp", { method: "POST", body: JSON.stringify({ cardKey: key }) }));
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "卡密校验失败。");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!credential) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      try {
        const next = await apiRequest<CodeStatus>(`/api/v2/redemptions/code-requests/${credential.requestId}`, { headers: { "X-Code-Request-Token": credential.retrievalToken } });
        if (stopped) return;
        setStatus(next);
        if (["pending", "running"].includes(next.status) && new Date(next.expiresAt).getTime() > Date.now()) timer = setTimeout(poll, Math.max(1000, credential.pollAfterMs));
      } catch (cause) {
        if (!stopped) setError(cause instanceof ApiClientError ? cause.message : "验证码状态查询失败。");
      }
    };
    void poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [credential]);

  useEffect(() => {
    if (!credential?.hasTotp) return;
    const timer = setInterval(async () => {
      if (document.hidden || !activeKey.current) return;
      try { setTotp(await apiRequest<Totp>("/api/v2/redemptions/totp", { method: "POST", body: JSON.stringify({ cardKey: activeKey.current }) })); } catch { /* next interval retries */ }
    }, 25_000);
    return () => clearInterval(timer);
  }, [credential?.hasTotp]);

  if (!credential) return <main className="flex min-h-screen items-center justify-center px-4"><form onSubmit={(event) => { event.preventDefault(); void createRequest(cardKey.trim()); }} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-glow"><Title /><input value={cardKey} onChange={(event) => setCardKey(event.target.value)} autoFocus placeholder="请输入卡密" className="mb-3 h-10 w-full rounded-lg border border-line2 bg-surface2 px-3 font-mono text-sm outline-none focus:border-accent" />{error && <p className="mb-3 text-sm text-rose-300">{error}</p>}<button disabled={busy || cardKey.trim().length < 8} className="primary-button">{busy ? "校验中…" : "进入"}</button></form></main>;

  return <main className="mx-auto max-w-lg px-4 py-10"><Title /><div className="space-y-4"><Card title="对应邮箱"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm"><Mail size={15} />{credential.email}</span><CopyButton value={credential.email} /></div></Card><Card title="邮箱验证码" action={<button onClick={() => void createRequest(activeKey.current)} disabled={busy} className="text-xs text-indigo-300"><RefreshCw className={`mr-1 inline ${busy ? "animate-spin" : ""}`} size={13} />创建新的 10 分钟查询</button>}>{status?.status === "found" && status.code ? <div><CopyCode icon={<KeyRound size={17} />} value={status.code} /><p className="mt-2 text-xs text-dim">{status.subject} · {status.receivedAt ? new Date(status.receivedAt).toLocaleString("zh-CN") : ""}</p></div> : status?.status === "expired" ? <p className="text-sm text-amber-300">10 分钟内未找到验证码，查询已自动结束。</p> : status?.status === "failed" ? <p className="text-sm text-rose-300">邮箱读取失败，请稍后新建查询。</p> : <p className="flex items-center gap-2 text-sm text-muted"><RefreshCw className="animate-spin" size={14} />Worker 正在按需检查收件箱与垃圾邮件，不会永久轮询。</p>}</Card><Card title="身份验证器验证码">{credential.hasTotp && totp?.totp ? <CopyCode icon={<Smartphone size={17} />} value={totp.totp} suffix={`${totp.secondsRemaining ?? 30}s`} /> : <p className="font-mono text-lg text-dim">----</p>}</Card></div></main>;
}

function Title(): React.ReactNode { return <div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-teal/15 p-2.5 text-teal"><Ticket size={22} /></span><div><h1 className="text-lg font-semibold text-glow-title">卡密兑换 V2</h1><p className="text-xs text-muted">不可猜测查询凭据 · 最长 10 分钟</p></div></div>; }
function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }): React.ReactNode { return <section className="rounded-xl border border-line bg-surface shadow-card"><header className="flex items-center justify-between border-b border-line px-5 py-3"><h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>{action}</header><div className="px-5 py-4">{children}</div></section>; }
function CopyButton({ value }: { value: string }): React.ReactNode { return <button className="text-muted hover:text-indigo-300" onClick={() => navigator.clipboard.writeText(value)}><Copy size={14} /></button>; }
function CopyCode({ icon, value, suffix }: { icon: React.ReactNode; value: string; suffix?: string }): React.ReactNode { return <button onClick={() => navigator.clipboard.writeText(value)} className="flex items-center gap-3">{icon}<span className="font-mono text-2xl tracking-widest text-emerald-300">{value}</span>{suffix && <span className="text-sm text-amber-300">| {suffix}</span>}<Copy size={14} className="text-muted" /></button>; }
