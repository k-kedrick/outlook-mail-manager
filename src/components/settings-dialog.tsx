"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { fieldClass, fieldClassSm } from "./ui/field";
import type { AppConfig } from "./types";

export function SettingsDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (config: AppConfig) => void;
}): React.ReactNode {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function changePassword(): Promise<void> {
    setPwBusy(true);
    setPwMsg(null);
    try {
      await api.post("/api/auth/password", { currentPassword, newPassword });
      window.location.assign("/login?passwordChanged=1");
    } catch (e) {
      setPwMsg({ ok: false, text: e instanceof Error ? e.message : "修改失败" });
    } finally {
      setPwBusy(false);
    }
  }

  useEffect(() => {
    api
      .get<{ config: AppConfig }>("/api/settings")
      .then((r) => setConfig(r.config))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  function patch(p: Partial<AppConfig>): void {
    setConfig((c) => (c ? { ...c, ...p } : c));
  }

  async function save(): Promise<void> {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.put<{ config: AppConfig }>("/api/settings", {
        refreshEnabled: config.refreshEnabled,
        refreshIntervalDays: config.refreshIntervalDays,
        statusCheckEnabled: config.statusCheckEnabled,
        statusCheckIntervalMinutes: config.statusCheckIntervalMinutes,
        codePollEnabled: config.codePollEnabled,
        codePollIntervalSeconds: config.codePollIntervalSeconds,
      });
      onSaved(res.config);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      title="设置"
      onClose={onClose}
      footer={
        config && (
          <>
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              保存
            </Button>
          </>
        )
      }
    >
      {!config ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <RefreshCw size={14} className="animate-spin" /> 加载中…
        </div>
      ) : (
        <div className="space-y-5">
          <section className="rounded-xl border border-line bg-surface2/40 p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-100">
              <input
                type="checkbox"
                className="accent-accent"
                checked={config.statusCheckEnabled}
                onChange={(e) => patch({ statusCheckEnabled: e.target.checked })}
              />
              自动检测状态
            </label>
            <div className="mt-2 flex items-center gap-2 pl-6 text-sm text-muted">
              每
              <input
                type="number"
                min={5}
                max={10080}
                value={config.statusCheckIntervalMinutes}
                onChange={(e) =>
                  patch({ statusCheckIntervalMinutes: Math.max(5, Number(e.target.value) || 5) })
                }
                className={`w-20 text-center ${fieldClassSm}`}
              />
              分钟检测一次（最低 5 分钟）
            </div>
            <p className="mt-1.5 pl-6 text-xs text-teal">
              只读探测，复用缓存令牌、不会轮换 RefreshToken，可较频繁；单账号轮换上限约每小时 1 次。
            </p>
          </section>

          <section className="rounded-xl border border-line bg-surface2/40 p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-100">
              <input
                type="checkbox"
                className="accent-accent"
                checked={config.refreshEnabled}
                onChange={(e) => patch({ refreshEnabled: e.target.checked })}
              />
              自动刷新 RefreshToken（保活）
            </label>
            <div className="mt-2 flex items-center gap-2 pl-6 text-sm text-muted">
              每
              <input
                type="number"
                min={1}
                max={90}
                value={config.refreshIntervalDays}
                onChange={(e) => patch({ refreshIntervalDays: Math.max(1, Number(e.target.value) || 1) })}
                className={`w-20 text-center ${fieldClassSm}`}
              />
              天刷新一次（仅到期账号）
            </div>
            <p className="mt-1.5 pl-6 text-xs text-amber-400/90">
              会轮换 RefreshToken，仅用于防止 ~90 天闲置失效；间隔别设太短，避免频繁轮换。
            </p>
          </section>

          <section className="rounded-xl border border-line bg-surface2/40 p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-100">
              <input
                type="checkbox"
                className="accent-accent"
                checked={config.codePollEnabled}
                onChange={(e) => patch({ codePollEnabled: e.target.checked })}
              />
              定时轮询获取验证码
            </label>
            <div className="mt-2 flex items-center gap-2 pl-6 text-sm text-muted">
              每
              <input
                type="number"
                min={10}
                max={86400}
                value={config.codePollIntervalSeconds}
                onChange={(e) =>
                  patch({ codePollIntervalSeconds: Math.max(10, Number(e.target.value) || 10) })
                }
                className={`w-20 text-center ${fieldClassSm}`}
              />
              秒抓一次（仅正常账号，最低 10 秒）
            </div>
            <p className="mt-1.5 pl-6 text-xs text-dim">
              验证码时效短，开启后会更频繁地访问微软；不用时建议关闭。
            </p>
          </section>

          <section className="rounded-xl border border-line bg-surface2/40 p-4">
            <h3 className="text-sm font-medium text-slate-100">修改管理员密码</h3>
            <div className="mt-3 space-y-2">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="当前密码"
                autoComplete="current-password"
                className={`w-full ${fieldClass}`}
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="新密码（至少 6 位）"
                autoComplete="new-password"
                className={`w-full ${fieldClass}`}
              />
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={pwBusy}
                  disabled={!currentPassword || newPassword.length < 6}
                  onClick={changePassword}
                >
                  修改密码
                </Button>
                {pwMsg && (
                  <span className={`text-xs ${pwMsg.ok ? "text-emerald-300" : "text-rose-400"}`}>
                    {pwMsg.text}
                  </span>
                )}
              </div>
            </div>
          </section>

          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
