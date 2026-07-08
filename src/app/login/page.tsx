"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";

export default function LoginPage(): React.ReactNode {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? "登录失败");
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface/80 p-8 shadow-card"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-accent/15 p-2.5 text-indigo-300">
            <LockKeyhole size={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Outlook 邮箱管理</h1>
            <p className="text-xs text-muted">请输入管理口令</p>
          </div>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="管理口令"
          autoFocus
          className="mb-3 h-10 w-full rounded-lg border border-line2 bg-surface2 px-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-dim focus:border-accent focus:ring-2 focus:ring-accent/20"
        />

        {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password}
          className="h-10 w-full rounded-lg bg-accent text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-600 disabled:opacity-50"
        >
          {loading ? "登录中…" : "登录"}
        </button>
      </form>
    </div>
  );
}
