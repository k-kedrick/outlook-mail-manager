"use client";

import { useState } from "react";
import { apiRequest, ApiClientError } from "@/features/api/client";

export function PasswordDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }): React.ReactNode {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(null); try { await apiRequest("/api/v2/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }); onChanged(); } catch (cause) { setError(cause instanceof ApiClientError ? cause.message : "修改失败。"); } finally { setBusy(false); } }} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6"><h2 className="font-semibold">修改管理员密码</h2><p className="mt-1 text-xs text-muted">成功后所有浏览器 Session（包括当前会话）立即失效。</p><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="当前密码" className="mt-4 h-10 w-full rounded-lg border border-line2 bg-surface2 px-3 text-sm outline-none" /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="新密码（至少 12 位）" className="mt-3 h-10 w-full rounded-lg border border-line2 bg-surface2 px-3 text-sm outline-none" />{error && <p className="mt-3 text-sm text-rose-300">{error}</p>}<div className="mt-4 flex justify-end gap-2"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="secondary-button border-accent" disabled={busy || newPassword.length < 12}>确认修改</button></div></form></div>;
}
