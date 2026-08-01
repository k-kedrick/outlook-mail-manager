"use client";

import { useQuery } from "@tanstack/react-query";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest, ApiClientError } from "@/features/api/client";

type Setup = { setupToken: string; secret: string; otpauthUri: string };

export default function LoginPage(): React.ReactNode {
  const router = useRouter();
  const status = useQuery({
    queryKey: ["bootstrap-status"],
    queryFn: () => apiRequest<{ required: boolean }>("/api/v2/auth/bootstrap/start"),
    retry: false,
  });
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [bootstrapPassword, setBootstrapPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiRequest("/api/v2/auth/login", {
        method: "POST",
        body: JSON.stringify(useRecoveryCode ? { password, recoveryCode } : { password, totp }),
      });
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "登录失败。");
    } finally {
      setBusy(false);
    }
  }

  async function startBootstrap(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSetup(
        await apiRequest<Setup>("/api/v2/auth/bootstrap/start", {
          method: "POST",
          body: JSON.stringify({ bootstrapPassword, newPassword }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "无法开始初始化。");
    } finally {
      setBusy(false);
    }
  }

  async function confirmBootstrap(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!setup) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ recoveryCodes: string[] }>("/api/v2/auth/bootstrap/confirm", {
        method: "POST",
        body: JSON.stringify({ setupToken: setup.setupToken, code: totp }),
      });
      setRecoveryCodes(result.recoveryCodes);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "验证码无效。");
    } finally {
      setBusy(false);
    }
  }

  if (status.isPending) return <CenteredCard><p className="text-sm text-muted">正在检查系统状态…</p></CenteredCard>;
  if (status.isError) return <CenteredCard><p className="text-sm text-rose-300">数据库或配置暂不可用，请检查 readiness。</p></CenteredCard>;
  if (recoveryCodes) {
    return (
      <CenteredCard>
        <Header icon={<ShieldCheck size={22} />} title="管理员初始化完成" subtitle="恢复码只显示这一次，请立即离线保存。" />
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 font-mono text-xs text-amber-100">
          {recoveryCodes.map((code) => <span key={code}>{code}</span>)}
        </div>
        <button className="primary-button" onClick={() => { router.replace("/"); router.refresh(); }}>我已安全保存，进入系统</button>
      </CenteredCard>
    );
  }
  if (status.data.required) {
    return (
      <CenteredCard>
        <Header icon={<KeyRound size={22} />} title="首次安全初始化" subtitle="设置强密码，并绑定管理员 TOTP。" />
        {!setup ? (
          <form onSubmit={startBootstrap} className="space-y-3">
            <Input label="部署初始化口令" type="password" value={bootstrapPassword} onChange={setBootstrapPassword} />
            <Input label="新的管理员密码（至少 12 位）" type="password" value={newPassword} onChange={setNewPassword} />
            <ErrorMessage value={error} />
            <button className="primary-button" disabled={busy || newPassword.length < 12}>生成 TOTP 配置</button>
          </form>
        ) : (
          <form onSubmit={confirmBootstrap} className="space-y-3">
            <div className="rounded-xl border border-line2 bg-surface2 p-3 text-xs text-muted">
              <p className="mb-1 text-slate-200">请在身份验证器中添加：</p>
              <p className="break-all font-mono text-teal">{setup.secret}</p>
              <details className="mt-2"><summary>显示完整 otpauth URI</summary><p className="mt-1 break-all">{setup.otpauthUri}</p></details>
            </div>
            <Input label="6 位动态验证码" inputMode="numeric" value={totp} onChange={setTotp} />
            <ErrorMessage value={error} />
            <button className="primary-button" disabled={busy || !/^\d{6}$/.test(totp)}>确认并生成恢复码</button>
          </form>
        )}
      </CenteredCard>
    );
  }
  return (
    <CenteredCard>
      <Header icon={<LockKeyhole size={22} />} title="Outlook Mail Manager V2" subtitle="请输入管理员密码与 TOTP。" />
      <form onSubmit={login} className="space-y-3">
        <Input label="管理员密码" type="password" value={password} onChange={setPassword} autoFocus />
        {useRecoveryCode
          ? <Input label="一次性恢复码" value={recoveryCode} onChange={setRecoveryCode} autoComplete="one-time-code" />
          : <Input label="6 位动态验证码" inputMode="numeric" value={totp} onChange={setTotp} autoComplete="one-time-code" />}
        <ErrorMessage value={error} />
        <button
          className="primary-button"
          disabled={busy || !password || (useRecoveryCode ? recoveryCode.trim().length < 10 : !/^\d{6}$/.test(totp))}
        >{busy ? "登录中…" : "安全登录"}</button>
        <button
          type="button"
          className="w-full text-center text-xs text-indigo-300 hover:text-indigo-200"
          onClick={() => { setUseRecoveryCode((current) => !current); setError(null); }}
        >{useRecoveryCode ? "使用 TOTP 登录" : "身份验证器不可用？使用恢复码"}</button>
      </form>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }): React.ReactNode {
  return <main className="flex min-h-screen items-center justify-center px-4"><section className="w-full max-w-md rounded-2xl border border-line bg-surface/90 p-7 shadow-card">{children}</section></main>;
}

function Header({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }): React.ReactNode {
  return <div className="mb-6 flex gap-3"><div className="rounded-xl bg-accent/15 p-2.5 text-indigo-300">{icon}</div><div><h1 className="font-semibold text-slate-100">{title}</h1><p className="text-xs text-muted">{subtitle}</p></div></div>;
}

function Input({ label, value, onChange, ...props }: { label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">): React.ReactNode {
  return <label className="block text-xs text-muted"><span className="mb-1 block">{label}</span><input {...props} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-lg border border-line2 bg-surface2 px-3 text-sm text-slate-100 outline-none focus:border-accent" /></label>;
}

function ErrorMessage({ value }: { value: string | null }): React.ReactNode {
  return value ? <p className="text-sm text-rose-300">{value}</p> : null;
}
