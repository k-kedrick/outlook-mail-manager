"use client";

import { useState } from "react";

export function ImportPanel({ open, busy, onClose, onImport }: { open: boolean; busy: boolean; onClose: () => void; onImport: (text: string) => Promise<void> }): React.ReactNode {
  const [text, setText] = useState("");
  if (!open) return null;
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4"><section className="w-full max-w-2xl rounded-2xl border border-line bg-surface p-5 shadow-card"><h2 className="font-semibold">批量导入账号</h2><p className="mt-1 text-xs text-muted">每行：email----password----clientId----refreshToken----totp。密码与 TOTP 可省略。</p><textarea value={text} onChange={(event) => setText(event.target.value)} className="mt-4 h-64 w-full rounded-xl border border-line2 bg-bg p-3 font-mono text-xs outline-none focus:border-accent" placeholder="email----password----clientId----refreshToken----totp" /><div className="mt-4 flex justify-end gap-2"><button className="secondary-button" onClick={onClose}>取消</button><button className="secondary-button border-accent text-indigo-200" disabled={busy || !text.trim()} onClick={() => onImport(text)}>{busy ? "导入中…" : "导入并排队探测"}</button></div></section></div>;
}
