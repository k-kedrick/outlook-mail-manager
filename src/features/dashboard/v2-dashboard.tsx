"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Download, FolderPlus, KeyRound, LogOut, Mail, Plus, RefreshCw, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AccountTable } from "@/features/accounts/account-table";
import { ImportPanel } from "@/features/accounts/import-panel";
import type { Account, AccountGroup, AccountPage } from "@/features/accounts/types";
import { apiRequest, ApiClientError } from "@/features/api/client";
import { PasswordDialog } from "@/features/auth/password-dialog";
import { MailDrawer } from "@/features/mail/mail-drawer";

type Feedback = { tone: "success" | "warning" | "error"; message: string; requestId?: string };
type JobProgress = {
  id: string;
  type: string;
  status: "pending" | "running" | "retry" | "succeeded" | "failed" | "cancelled";
  attempts: number;
  maxAttempts: number;
  result: unknown;
  lastErrorCode: string | null;
};

export function V2Dashboard(): React.ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [groupTarget, setGroupTarget] = useState("");
  const accountsQuery = useQuery({
    queryKey: ["accounts", query],
    queryFn: () => apiRequest<AccountPage>(`/api/v2/accounts?limit=200${query ? `&query=${encodeURIComponent(query)}` : ""}`),
  });
  const accounts = useMemo(() => accountsQuery.data?.accounts ?? [], [accountsQuery.data]);
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: () => apiRequest<AccountGroup[]>("/api/v2/groups"),
  });
  const jobQuery = useQuery({
    queryKey: ["job", activeJobId],
    queryFn: () => apiRequest<JobProgress>(`/api/v2/jobs/${activeJobId}`),
    enabled: Boolean(activeJobId),
    refetchInterval: (queryResult) => {
      const status = queryResult.state.data?.status;
      return status && ["succeeded", "failed", "cancelled"].includes(status) ? false : 2_000;
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    if (!oauth) return;
    if (oauth === "success") {
      setFeedback({ tone: "success", message: `${params.get("resource") === "outlook_imap" ? "IMAP" : "Graph"} 授权成功，能力探测将由 Worker 执行。` });
    } else {
      setFeedback({ tone: "error", message: `Microsoft 授权失败：${params.get("code") ?? "UNKNOWN"}`, requestId: params.get("requestId") ?? undefined });
    }
    window.history.replaceState({}, "", "/");
    void queryClient.invalidateQueries({ queryKey: ["accounts"] });
  }, [queryClient]);

  useEffect(() => {
    const job = jobQuery.data;
    if (!job || !activeJobId) return;
    if (job.status === "succeeded") {
      setFeedback({ tone: "success", message: `能力探测完成（尝试 ${job.attempts} 次）。账号能力已更新。` });
      setActiveJobId(null);
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } else if (job.status === "failed" || job.status === "cancelled") {
      setFeedback({ tone: "error", message: `能力探测${job.status === "cancelled" ? "已取消" : "失败"}：${job.lastErrorCode ?? "UNKNOWN"}` });
      setActiveJobId(null);
    } else if (job.status === "retry") {
      setFeedback({ tone: "warning", message: `能力探测暂时失败，Worker 将自动重试（${job.attempts}/${job.maxAttempts}）。` });
    }
  }, [activeJobId, jobQuery.data, queryClient]);

  const importMutation = useMutation({
    mutationFn: (text: string) => apiRequest<{ requested: number; created: number; updated: number; failed: unknown[] }>("/api/v2/accounts/import", { method: "POST", body: JSON.stringify({ text }) }),
    onSuccess: (result) => {
      setImportOpen(false);
      setFeedback({ tone: result.failed.length ? "warning" : "success", message: `导入完成：请求 ${result.requested}，新增 ${result.created}，更新 ${result.updated}，失败 ${result.failed.length}。` });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: showError,
  });
  const probeMutation = useMutation({
    mutationFn: (account: Account) => apiRequest<{ jobId: string }>(`/api/v2/accounts/${account.id}/capabilities/probe`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() } }),
    onSuccess: (result) => {
      setActiveJobId(result.jobId);
      setFeedback({ tone: "success", message: `能力探测已进入 Worker 队列，正在等待任务 ${result.jobId}。` });
    },
    onError: showError,
  });
  const oauthMutation = useMutation({
    mutationFn: (input: { resource: "graph" | "outlook_imap"; accountId?: string }) => {
      const endpoint = input.accountId
        ? `/api/v2/accounts/${input.accountId}/reauthorize`
        : "/api/v2/oauth/microsoft/start";
      return apiRequest<{ authorizationUrl: string }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ resource: input.resource }),
      });
    },
    onSuccess: (result) => window.location.assign(result.authorizationUrl),
    onError: showError,
  });

  function showError(cause: Error): void {
    const error = cause instanceof ApiClientError ? cause : new ApiClientError("REQUEST_FAILED", "操作失败。");
    setFeedback({ tone: "error", message: error.message, requestId: error.requestId });
  }

  function toggle(accountId: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(accountId)) next.delete(accountId); else next.add(accountId);
      return next;
    });
  }

  async function exportSelected(): Promise<void> {
    try {
      const result = await apiRequest<{ count: number; text: string }>("/api/v2/accounts/export", { method: "POST", body: JSON.stringify({ accountIds: [...selectedIds] }) });
      downloadText(`outlook-accounts-${Date.now()}.txt`, result.text);
      setFeedback({ tone: "success", message: `已安全导出 ${result.count} 个账号。` });
    } catch (cause) { showError(cause as Error); }
  }

  async function generateCardKeys(): Promise<void> {
    try {
      const result = await apiRequest<{ generated: Array<{ accountId: string; code: string }>; skipped: string[]; failed: unknown[] }>("/api/v2/card-keys", { method: "POST", body: JSON.stringify({ accountIds: [...selectedIds], regenerate: false }) });
      const emailById = new Map(accounts.map((account) => [account.id, account.email]));
      downloadText(`card-keys-${Date.now()}.txt`, result.generated.map((item) => `${emailById.get(item.accountId) ?? item.accountId}----${item.code}`).join("\n"));
      setFeedback({ tone: result.failed.length ? "warning" : "success", message: `卡密创建 ${result.generated.length}，跳过 ${result.skipped.length}，失败 ${result.failed.length}。明文已下载且数据库不可恢复。` });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    } catch (cause) { showError(cause as Error); }
  }

  async function deleteSelected(): Promise<void> {
    if (!window.confirm(`确定永久删除选中的 ${selectedIds.size} 个账号及其 Grant、任务和卡密吗？`)) return;
    let failed = 0;
    for (const id of selectedIds) {
      try { await apiRequest(`/api/v2/accounts/${id}`, { method: "DELETE" }); } catch { failed += 1; }
    }
    setFeedback({ tone: failed ? "warning" : "success", message: `删除完成：成功 ${selectedIds.size - failed}，失败 ${failed}。` });
    setSelectedIds(new Set());
    void queryClient.invalidateQueries({ queryKey: ["accounts"] });
  }

  async function assignSelectedGroup(): Promise<void> {
    let failed = 0;
    for (const id of selectedIds) {
      try {
        await apiRequest(`/api/v2/accounts/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ groupId: groupTarget || null }),
        });
      } catch {
        failed += 1;
      }
    }
    setFeedback({
      tone: failed ? "warning" : "success",
      message: `分组更新完成：成功 ${selectedIds.size - failed}，失败 ${failed}。`,
    });
    void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    void queryClient.invalidateQueries({ queryKey: ["groups"] });
  }

  async function createGroup(): Promise<void> {
    const name = window.prompt("请输入新分组名称");
    if (!name?.trim()) return;
    try {
      await apiRequest("/api/v2/groups", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      setFeedback({ tone: "success", message: `分组“${name.trim()}”已创建。` });
      void queryClient.invalidateQueries({ queryKey: ["groups"] });
    } catch (cause) {
      showError(cause as Error);
    }
  }

  async function logout(): Promise<void> {
    try { await apiRequest("/api/v2/auth/logout", { method: "POST" }); } finally { router.replace("/login"); router.refresh(); }
  }

  return <main className="mx-auto min-h-screen max-w-[1500px] px-5 py-6">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><div className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-2.5 text-indigo-300"><Mail size={24} /></div><div><h1 className="text-xl font-semibold text-glow-title">Outlook Mail Manager V2</h1><p className="text-xs text-muted">模块化单体 · Web / Worker · PostgreSQL</p></div></div>
      <div className="flex flex-wrap gap-2"><button className="secondary-button" onClick={() => oauthMutation.mutate({ resource: "graph" })}><Plus className="mr-1 inline" size={15} />Microsoft 授权</button><button className="secondary-button" onClick={() => setImportOpen(true)}><Upload className="mr-1 inline" size={15} />批量导入</button><button className="secondary-button" onClick={() => setPasswordOpen(true)}><ShieldCheck size={15} /></button><button className="secondary-button" onClick={logout}><LogOut size={15} /></button></div>
    </header>
    <section className="mb-4 grid gap-3 sm:grid-cols-4"><Metric icon={<Database size={17} />} label="账号" value={accounts.length} /><Metric label="Graph 可用" value={accounts.filter((account) => account.capabilities.some((item) => item.protocol === "graph" && item.state === "available")).length} /><Metric label="IMAP 可用" value={accounts.filter((account) => account.capabilities.some((item) => item.protocol === "imap" && item.state === "available")).length} /><Metric label="需重新授权" value={accounts.filter((account) => account.grants.some((grant) => grant.status === "reauth_required")).length} /></section>
    {feedback && <FeedbackBar value={feedback} onClose={() => setFeedback(null)} />}
    <div className="mb-3 flex flex-wrap items-center gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索邮箱…" className="h-10 w-full max-w-sm rounded-lg border border-line2 bg-surface px-3 text-sm outline-none focus:border-accent" /><button className="secondary-button" onClick={() => accountsQuery.refetch()}><RefreshCw size={15} /></button><button className="secondary-button" onClick={createGroup} title="创建分组"><FolderPlus size={15} /></button>{selectedIds.size > 0 && <><span className="ml-2 text-sm text-indigo-200">已选 {selectedIds.size}</span><select value={groupTarget} onChange={(event) => setGroupTarget(event.target.value)} className="h-10 rounded-lg border border-line2 bg-surface px-2 text-sm"><option value="">移出分组</option>{groupsQuery.data?.map((group) => <option key={group.id} value={group.id}>{group.name}（{group._count.accounts}）</option>)}</select><button className="secondary-button" onClick={assignSelectedGroup}>应用分组</button><button className="secondary-button" onClick={generateCardKeys}><KeyRound className="mr-1 inline" size={14} />卡密</button><button className="secondary-button" onClick={exportSelected}><Download className="mr-1 inline" size={14} />导出</button><button className="secondary-button border-rose-500/40 text-rose-300" onClick={deleteSelected}><Trash2 size={14} /></button></>}<span className="ml-auto text-xs text-muted">Refresh Token 只显示真实维护时间，不伪造 90 天到期日</span></div>
    {accountsQuery.isError ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">无法读取账号，请检查 readiness 与 Session。</div> : <AccountTable accounts={accounts} selectedIds={selectedIds} onToggle={toggle} onOpen={setSelectedAccount} onProbe={(account) => probeMutation.mutate(account)} onAuthorizeGraph={(account) => oauthMutation.mutate({ resource: "graph", accountId: account.id })} onAuthorizeImap={(account) => oauthMutation.mutate({ resource: "outlook_imap", accountId: account.id })} />}
    <ImportPanel open={importOpen} busy={importMutation.isPending} onClose={() => setImportOpen(false)} onImport={async (text) => { await importMutation.mutateAsync(text); }} />
    <PasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} onChanged={() => { router.replace("/login?passwordChanged=1"); router.refresh(); }} />
    <MailDrawer account={selectedAccount} onClose={() => setSelectedAccount(null)} />
  </main>;
}

function downloadText(filename: string, value: string): void { const url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
function Metric({ icon, label, value }: { icon?: React.ReactNode; label: string; value: number }): React.ReactNode { return <div className="rounded-xl border border-line bg-surface p-3 shadow-card"><p className="flex items-center gap-1.5 text-xs text-muted">{icon}{label}</p><p className="mt-1 text-xl font-semibold text-slate-100">{value}</p></div>; }
function FeedbackBar({ value, onClose }: { value: Feedback; onClose: () => void }): React.ReactNode { const style = value.tone === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : value.tone === "warning" ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"; return <div className={`mb-4 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${style}`}><span>{value.message}{value.requestId ? `（请求 ${value.requestId}）` : ""}</span><button onClick={onClose}>×</button></div>; }
