"use client";

import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, Mail, RefreshCw, RotateCw, ShieldCheck, Smartphone, Ticket, Trash2, X } from "lucide-react";
import { api } from "@/lib/client";
import { Pill, StatusBadge } from "./ui/badge";
import { Button } from "./ui/button";
import type { Account, MailMessage } from "./types";

type Reveal = { email: string; password: string; clientId: string; refreshToken: string };
type FolderPage = { loaded: number; nextOffset: number; hasMore: boolean };
type Inbox = {
  source: "graph" | "outlook";
  messages: MailMessage[];
  junkError: string | null;
  folders: { inbox: FolderPage; junk: FolderPage };
};
type CodeResult = {
  code: string | null;
  codeAt: string | null;
  subject: string | null;
  from: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function CopyButton({ value }: { value: string }): React.ReactNode {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="text-muted transition-colors hover:text-indigo-300"
      title="复制"
    >
      <Copy size={14} />
      {copied && <span className="ml-1 text-[10px] text-emerald-300">已复制</span>}
    </button>
  );
}

function DrawerSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <section className="rounded-lg border border-line bg-surface2/25">
      <div className="flex items-center justify-between gap-2 border-b border-line/70 px-4 py-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function AccountDrawer({
  account,
  onClose,
  onChanged,
}: {
  account: Account;
  onClose: () => void;
  onChanged: () => void;
}): React.ReactNode {
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [openMsg, setOpenMsg] = useState<MailMessage | null>(null);
  const [code, setCode] = useState<CodeResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefix, setPrefix] = useState("");
  const [totp, setTotp] = useState<{ code: string; secondsRemaining: number } | null>(null);
  const [totpSecret, setTotpSecret] = useState("");

  // Live authenticator (TOTP) code: fetch once, tick down each second, refetch on rollover.
  // Pause rollover requests while the browser tab is hidden; refresh once when visible again.
  useEffect(() => {
    if (!account.has2fa) {
      setTotp(null);
      return;
    }
    let active = true;
    const load = async (): Promise<void> => {
      if (document.hidden) return;
      try {
        const r = await api.post<{ totp: string | null; secondsRemaining: number }>(
          `/api/accounts/${account.id}/totp`,
        );
        if (active) setTotp(r.totp ? { code: r.totp, secondsRemaining: r.secondsRemaining } : null);
      } catch {
        /* ignore transient errors; next tick retries */
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
  }, [account.id, account.has2fa]);

  async function run(key: string, fn: () => Promise<void>): Promise<void> {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  const doReveal = () =>
    run("reveal", async () => {
      if (reveal) {
        setShowSecrets((s) => !s);
        return;
      }
      const data = await api.post<Reveal>(`/api/accounts/${account.id}/reveal`);
      setReveal(data);
      setShowSecrets(true);
    });

  const doStatus = () =>
    run("status", async () => {
      await api.post(`/api/accounts/check-status`, { ids: [account.id] });
      onChanged();
    });

  const doCheck = () =>
    run("check", async () => {
      await api.post(`/api/accounts/${account.id}/check`);
      onChanged();
    });

  const copyLine = () =>
    run("copyline", async () => {
      let r = reveal;
      if (!r) {
        r = await api.post<Reveal>(`/api/accounts/${account.id}/reveal`);
        setReveal(r);
      }
      await navigator.clipboard.writeText([r.email, r.password, r.clientId, r.refreshToken].join("----"));
    });

  const doInbox = () =>
    run("inbox", async () => {
      const data = await api.get<Inbox>(`/api/accounts/${account.id}/mail?limit=20`);
      setInbox(data);
      setOpenMsg(null);
      onChanged();
    });

  const loadMoreMail = () =>
    run("inbox-more", async () => {
      if (!inbox) return;
      const params = new URLSearchParams({
        limit: "20",
        inboxOffset: String(inbox.folders.inbox.nextOffset),
        junkOffset: String(inbox.folders.junk.nextOffset),
      });
      const data = await api.get<Inbox>(`/api/accounts/${account.id}/mail?${params}`);
      const unique = new Map<string, MailMessage>();
      for (const message of [...inbox.messages, ...data.messages]) {
        unique.set(`${message.source}:${message.folder}:${message.id}`, message);
      }
      const messages = [...unique.values()].sort(
        (a, b) => new Date(b.receivedAt ?? 0).getTime() - new Date(a.receivedAt ?? 0).getTime(),
      );
      setInbox({ ...data, messages, junkError: data.junkError ?? inbox.junkError });
    });

  const doCode = () =>
    run("code", async () => {
      const { result } = await api.post<{ result: CodeResult }>(`/api/accounts/${account.id}/code`);
      setCode(result);
      onChanged();
    });

  const openMessage = (m: MailMessage) =>
    run("msg", async () => {
      const data = await api.get<{ message: MailMessage }>(
        `/api/accounts/${account.id}/mail/${encodeURIComponent(m.id)}?source=${m.source}`,
      );
      setOpenMsg(data.message);
    });

  // regenerate:true handles both cases — create if none, replace if already bound.
  const doCardKey = () =>
    run("cardkey", async () => {
      await api.post(`/api/cardkeys/generate`, {
        ids: [account.id],
        prefix: prefix.trim(),
        regenerate: true,
      });
      onChanged();
    });

  const doUnbind = () =>
    run("unbind", async () => {
      await api.post(`/api/cardkeys/unbind`, { ids: [account.id] });
      onChanged();
    });

  const doRemoveTotp = () =>
    run("totp-remove", async () => {
      if (!confirm("确认删除这个账号的身份验证器密钥？此操作不会删除账号。")) return;
      await api.post(`/api/accounts/totp/unbind`, { ids: [account.id] });
      setTotp(null);
      setTotpSecret("");
      onChanged();
    });

  const doSetTotp = () =>
    run("totp-set", async () => {
      await api.put(`/api/accounts/${account.id}/totp-secret`, { secret: totpSecret.trim() });
      setTotpSecret("");
      onChanged();
    });

  const copyText = async (v: string): Promise<void> => {
    await navigator.clipboard.writeText(v);
  };

  const secretValue = (v: string) => (showSecrets ? v : "•".repeat(Math.min(v.length, 16)));

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/50 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line bg-surface2/25 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-100">{account.email}</span>
              <StatusBadge status={account.status} />
            </div>
            <p className="mt-0.5 text-xs text-dim">
              上次检测：{fmt(account.lastCheckedAt)} · 上次刷新令牌：{fmt(account.refreshTokenUpdatedAt)} ·
              有效期剩余 {account.remainingValidityDays} 天
            </p>
          </div>
          <button onClick={onClose} className="text-muted transition-colors hover:text-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
          <Button size="sm" variant="secondary" icon={<ShieldCheck size={14} />} loading={busy === "status"} onClick={doStatus}>
            检测状态
          </Button>
          <Button size="sm" variant="accentSoft" icon={<RotateCw size={14} />} loading={busy === "check"} onClick={doCheck}>
            刷新令牌
          </Button>
          <Button size="sm" variant="secondary" icon={<Mail size={14} />} loading={busy === "inbox"} onClick={doInbox}>
            读取收件箱
          </Button>
          <Button size="sm" variant="secondary" icon={<KeyRound size={14} />} loading={busy === "code"} onClick={doCode}>
            最新验证码
          </Button>
          <Button size="sm" variant="ghost" icon={<Copy size={14} />} loading={busy === "copyline"} onClick={copyLine}>
            复制账号行
          </Button>
        </div>

        {error && (
          <div className="mx-5 mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-auto p-5">
          {/* Credentials */}
          <DrawerSection
            title="凭据"
            action={
              <button
                onClick={doReveal}
                className="flex items-center gap-1 text-xs text-indigo-300 transition-colors hover:text-indigo-200"
              >
                {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}
                {showSecrets ? "隐藏" : "显示"}
              </button>
            }
          >
            <CredRow label="邮箱" value={account.email} copyValue={account.email} />
            <CredRow label="密码" value={reveal ? secretValue(reveal.password) : "••••••••"} copyValue={reveal?.password} />
            <CredRow label="ClientId" value={account.clientId} copyValue={account.clientId} />
            <CredRow
              label="RefreshToken"
              value={reveal ? (showSecrets ? reveal.refreshToken : "••••••••••••") : "••••••••••••"}
              copyValue={reveal?.refreshToken}
              mono
            />
          </DrawerSection>

          {/* Card key */}
          <DrawerSection title="卡密" action={account.cardKey ? <CopyButton value={account.cardKey} /> : null}>
            {account.cardKey ? (
              <p className="mb-3 font-mono text-sm text-teal">{account.cardKey}</p>
            ) : (
              <p className="mb-3 text-sm text-muted">未绑定卡密</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="前缀(可选)"
                maxLength={20}
                className="h-8 w-32 rounded-lg border border-line2 bg-surface2 px-2 text-xs text-slate-100 outline-none placeholder:text-dim focus:border-accent"
              />
              <Button size="sm" variant="tealSoft" icon={<Ticket size={13} />} loading={busy === "cardkey"} onClick={doCardKey}>
                {account.cardKey ? "重新生成" : "生成卡密"}
              </Button>
              {account.cardKey && (
                <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} loading={busy === "unbind"} onClick={doUnbind}>
                  取消绑定
                </Button>
              )}
            </div>
          </DrawerSection>

          {/* Authenticator (TOTP) */}
          <DrawerSection
            title="身份验证器"
            action={
              account.has2fa ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={13} />}
                  loading={busy === "totp-remove"}
                  onClick={doRemoveTotp}
                >
                  删除 2FA
                </Button>
              ) : null
            }
          >
            {!account.has2fa ? (
              <p className="mb-3 text-sm text-muted">未绑定身份验证器密钥</p>
            ) : totp ? (
              <button
                onClick={() => copyText(totp.code)}
                title="点击复制"
                className="flex items-center gap-3 rounded-md border border-emerald-500/15 bg-emerald-500/5 px-3 py-2 transition-colors hover:border-emerald-500/25"
              >
                <span className="font-mono text-2xl tracking-[0.18em] text-emerald-300">{totp.code}</span>
                <span className="flex items-center gap-1 text-xs text-amber-300/90">
                  <Smartphone size={12} /> {totp.secondsRemaining}s
                </span>
                <Copy size={14} className="text-muted" />
              </button>
            ) : (
              <p className="flex items-center gap-2 text-xs text-muted">
                <RefreshCw size={12} className="animate-spin" /> 计算中…
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={totpSecret}
                onChange={(e) => setTotpSecret(e.target.value)}
                placeholder={account.has2fa ? "输入新 2FA 密钥以替换" : "输入 2FA 密钥"}
                className="h-8 min-w-0 flex-1 rounded-md border border-line2/80 bg-surface2/80 px-2 text-xs text-slate-100 outline-none placeholder:text-dim focus:border-accent/70"
              />
              <Button
                size="sm"
                variant="tealSoft"
                icon={<Smartphone size={13} />}
                loading={busy === "totp-set"}
                disabled={!totpSecret.trim()}
                onClick={doSetTotp}
              >
                {account.has2fa ? "替换 2FA" : "添加 2FA"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-dim">只修改当前账号的身份验证器密钥，不读取邮箱、不刷新令牌。</p>
          </DrawerSection>

          {/* Verification code */}
          {code && (
            <DrawerSection title="验证码">
              {code.code ? (
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-2xl tracking-widest text-emerald-300">{code.code}</span>
                    <CopyButton value={code.code} />
                  </div>
                  {(code.from || code.subject) && (
                    <p className="mt-1 text-xs text-muted">
                      来自 {code.from} · {code.subject}
                    </p>
                  )}
                  {code.codeAt && <p className="mt-1 text-xs text-dim">时间：{fmt(code.codeAt)}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted">收件箱与垃圾邮件中未找到验证码。</p>
              )}
            </DrawerSection>
          )}

          {/* Inbox / message */}
          {openMsg ? (
            <section className="overflow-hidden rounded-xl border border-line bg-surface2/40">
              <div className="flex items-center justify-between border-b border-line px-4 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{openMsg.subject}</p>
                  <p className="truncate text-xs text-dim">
                    {openMsg.fromName ? `${openMsg.fromName} · ` : ""}
                    {openMsg.from} · {fmt(openMsg.receivedAt)}
                  </p>
                </div>
                <button
                  onClick={() => setOpenMsg(null)}
                  className="shrink-0 text-xs text-indigo-300 transition-colors hover:text-indigo-200"
                >
                  返回列表
                </button>
              </div>
              <div className="p-2">
                {openMsg.bodyHtml ? (
                  <iframe title="邮件正文" sandbox="" srcDoc={openMsg.bodyHtml} className="h-96 w-full rounded-lg bg-white" />
                ) : (
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-2 text-xs text-slate-300">
                    {openMsg.bodyText || "(空邮件)"}
                  </pre>
                )}
              </div>
            </section>
          ) : (
            inbox && (
              <section className="overflow-hidden rounded-xl border border-line bg-surface2/40">
                <div className="flex items-center justify-between border-b border-line px-4 py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    收件箱 {inbox.messages.filter((m) => m.folder === "inbox").length}
                    {inbox.folders.inbox.hasMore ? "+" : ""} + 垃圾邮件{" "}
                    {inbox.messages.filter((m) => m.folder === "junk").length}
                    {inbox.folders.junk.hasMore ? "+" : ""}
                  </h3>
                  <div className="flex items-center gap-2">
                    {inbox.junkError && (
                      <span className="text-[10px] text-rose-400/70" title={inbox.junkError}>
                        垃圾邮件读取失败
                      </span>
                    )}
                    <span className="text-[10px] text-dim">来源：{inbox.source.toUpperCase()}</span>
                  </div>
                </div>
                {inbox.messages.length === 0 ? (
                  <p className="p-4 text-sm text-muted">收件箱为空。</p>
                ) : (
                  <ul className="divide-y divide-line/70">
                    {inbox.messages.map((m) => (
                      <li key={`${m.source}:${m.folder}:${m.id}`}>
                        <button
                          onClick={() => openMessage(m)}
                          className="block w-full px-4 py-2 text-left transition-colors hover:bg-accent/[0.06]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`truncate text-sm ${m.isRead ? "text-muted" : "font-semibold text-slate-100"}`}>
                              {m.subject}
                            </span>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {m.folder === "junk" && <Pill tone="amber">垃圾邮件</Pill>}
                              <span className="text-[10px] text-dim">{fmt(m.receivedAt)}</span>
                            </div>
                          </div>
                          <p className="truncate text-xs text-dim">
                            {m.fromName ? `${m.fromName} · ` : ""}
                            {m.from}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {(inbox.folders.inbox.hasMore || inbox.folders.junk.hasMore) && (
                  <div className="border-t border-line p-3 text-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === "inbox-more"}
                      onClick={loadMoreMail}
                    >
                      加载更多
                    </Button>
                  </div>
                )}
              </section>
            )
          )}

          {busy === "msg" && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <RefreshCw size={12} className="animate-spin" /> 加载邮件中…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CredRow({
  label,
  value,
  copyValue,
  mono,
}: {
  label: string;
  value: string;
  copyValue?: string;
  mono?: boolean;
}): React.ReactNode {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-24 shrink-0 text-xs text-dim">{label}</span>
      <span className={`min-w-0 flex-1 truncate text-xs text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</span>
      {copyValue && <CopyButton value={copyValue} />}
    </div>
  );
}
