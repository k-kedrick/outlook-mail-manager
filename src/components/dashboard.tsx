"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  FolderCog,
  KeyRound,
  LogOut,
  Mail,
  RefreshCw,
  RotateCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Ticket,
  Trash2,
  Upload,
  Minus,
} from "lucide-react";
import { api } from "@/lib/client";
import { AccountDrawer } from "./account-drawer";
import { BulkGroupDialog } from "./bulk-group-dialog";
import { CardKeyDialog } from "./card-key-dialog";
import { ExportDialog } from "./export-dialog";
import { GroupsDialog } from "./groups-dialog";
import { ImportDialog } from "./import-dialog";
import { SettingsDialog } from "./settings-dialog";
import { TotpDialog } from "./totp-dialog";
import { Pill, RiskBadge, STATUS_OPTIONS, StatusBadge } from "./ui/badge";
import { Button, IconButton } from "./ui/button";
import { Card } from "./ui/card";
import { fieldClass, fieldClassSm } from "./ui/field";
import type { Account, AccountsResponse, AppConfig, Group } from "./types";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export function Dashboard(): React.ReactNode {
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [q, setQ] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [staleOnly, setStaleOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [headerSelectionMode, setHeaderSelectionMode] = useState<"default" | "inverted">("default");
  const [selectVisibleFocused, setSelectVisibleFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [bulkGroupIds, setBulkGroupIds] = useState<string[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cardKeyIds, setCardKeyIds] = useState<string[] | null>(null);
  const [totpIds, setTotpIds] = useState<string[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [drawer, setDrawer] = useState<Account | null>(null);
  const selectVisibleRef = useRef<HTMLInputElement | null>(null);

  const loadAccounts = useCallback(async () => {
    setHeaderSelectionMode("default");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (groupFilter) params.set("group", groupFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (staleOnly) params.set("risk", "stale");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await api.get<AccountsResponse>(`/api/accounts?${params.toString()}`);
      setData(res);
      setDrawer((cur) => (cur ? res.accounts.find((a) => a.id === cur.id) ?? cur : cur));
    } finally {
      setLoading(false);
    }
  }, [q, groupFilter, statusFilter, staleOnly, page, pageSize]);

  // Restore saved page size once on mount.
  useEffect(() => {
    const saved = Number(localStorage.getItem("outlook_page_size"));
    if (saved >= 1 && saved <= 1000) setPageSize(saved);
  }, []);

  function applyPageSize(value: number): void {
    const clamped = Math.min(1000, Math.max(1, Math.round(value) || 50));
    setHeaderSelectionMode("default");
    setPageSize(clamped);
    setPage(1);
    localStorage.setItem("outlook_page_size", String(clamped));
  }

  const loadGroups = useCallback(async () => {
    const res = await api.get<{ groups: Group[] }>("/api/groups");
    setGroups(res.groups);
  }, []);

  const loadConfig = useCallback(async () => {
    const res = await api.get<{ config: AppConfig }>("/api/settings");
    setConfig(res.config);
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);
  useEffect(() => {
    void loadGroups();
    void loadConfig();
  }, [loadGroups, loadConfig]);

  const accounts = data?.accounts ?? [];
  const visibleIds = accounts.map((a) => a.id);
  const selectedVisibleCount = visibleIds.filter((id) => selected.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const headerSelectionLabel =
    visibleIds.length === 0
      ? "当前列表没有账号"
      : allVisibleSelected
        ? "取消选择当前列表"
        : someVisibleSelected && headerSelectionMode === "default"
          ? "反选当前列表"
          : "全选当前列表";

  useEffect(() => {
    if (selectVisibleRef.current) {
      selectVisibleRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  function toggle(id: string): void {
    setHeaderSelectionMode("default");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisibleSelection(): void {
    const shouldClearVisible = allVisibleSelected;
    const shouldInvertVisible = someVisibleSelected && headerSelectionMode === "default";

    setSelected((prev) => {
      const next = new Set(prev);
      if (shouldClearVisible) {
        visibleIds.forEach((id) => next.delete(id));
      } else if (shouldInvertVisible) {
        visibleIds.forEach((id) => {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        });
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
    setHeaderSelectionMode(shouldInvertVisible ? "inverted" : "default");
  }

  async function withBusy(key: string, fn: () => Promise<void>): Promise<void> {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  const checkStatus = (all: boolean) =>
    withBusy("status", async () => {
      const res = await api.post<{ checked: number; summary: Record<string, number> }>(
        "/api/accounts/check-status",
        all ? {} : { ids: [...selected] },
      );
      await loadAccounts();
      const parts = Object.entries(res.summary).map(([k, v]) => `${k}:${v}`);
      setMessage(`检测状态完成 ${res.checked} 个（不轮换令牌）— ${parts.join("，") || "无账号"}`);
    });

  const refreshTokens = (all: boolean) =>
    withBusy("refresh", async () => {
      const res = await api.post<{ checked: number; summary: Record<string, number> }>(
        "/api/accounts/keep-alive",
        all ? {} : { ids: [...selected] },
      );
      await loadAccounts();
      const parts = Object.entries(res.summary).map(([k, v]) => `${k}:${v}`);
      setMessage(`刷新令牌完成 ${res.checked} 个 — ${parts.join("，") || "无账号"}`);
    });

  const fetchCodes = (all: boolean) =>
    withBusy("codes", async () => {
      const res = await api.post<{ fetched: number; withCode: number }>(
        "/api/accounts/fetch-codes",
        all ? {} : { ids: [...selected] },
      );
      await loadAccounts();
      setMessage(`获取验证码完成：${res.fetched} 个账号，命中 ${res.withCode} 个`);
    });

  const fetchCodeRow = (id: string) =>
    withBusy(`code-${id}`, async () => {
      await api.post(`/api/accounts/${id}/code`);
      await loadAccounts();
    });

  const bulkDelete = () =>
    withBusy("delete", async () => {
      if (!selected.size) return;
      if (!confirm(`确认删除选中的 ${selected.size} 个账号？此操作不可撤销。`)) return;
      const res = await api.post<{ deleted: number }>("/api/accounts/bulk-delete", {
        ids: [...selected],
      });
      setSelected(new Set());
      await loadAccounts();
      setMessage(`已删除 ${res.deleted} 个账号`);
    });

  const assignGroup = (id: string, groupId: string) =>
    withBusy(`grp-${id}`, async () => {
      await api.patch(`/api/accounts/${id}`, { groupId: groupId || null });
      await Promise.all([loadAccounts(), loadGroups()]);
    });

  async function copy(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    setMessage("已复制到剪贴板");
  }

  async function logout(): Promise<void> {
    await api.post("/api/auth/logout");
    window.location.href = "/login";
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasSelection = selected.size > 0;

  return (
    <div className="mx-auto max-w-[1540px] px-5 py-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-indigo-300">
              <Mail size={18} />
            </span>
            <h1 className="text-glow-title text-lg font-semibold">Outlook 邮箱管理</h1>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill>共 {data?.total ?? 0}</Pill>
            <Pill tone="green" dot="#34d399">
              正常 {data?.statusCounts?.OK ?? 0}
            </Pill>
            <Pill tone="rose" dot="#fb7185">
              失效 {data?.statusCounts?.AUTH_FAILED ?? 0}
            </Pill>
            {config && (
              <>
                <Pill tone={config.statusCheckEnabled ? "accent" : "muted"}>
                  状态检测 每{config.statusCheckIntervalMinutes}分 · {config.statusCheckEnabled ? "开" : "关"}
                </Pill>
                <Pill tone={config.refreshEnabled ? "teal" : "muted"}>
                  令牌保活 每{config.refreshIntervalDays}天 · {config.refreshEnabled ? "开" : "关"}
                </Pill>
                <Pill tone={config.codePollEnabled ? "amber" : "muted"}>
                  验证码轮询 每{config.codePollIntervalSeconds}秒 · {config.codePollEnabled ? "开" : "关"}
                </Pill>
              </>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={<LogOut size={14} />} onClick={logout}>
          退出
        </Button>
      </div>

      {/* Fixed selection action slot — keeps filters/table from jumping when rows are selected. */}
      <div
        className={`mb-3 min-h-[46px] rounded-lg px-3 py-2 ${
          hasSelection ? "border border-line/70 bg-surface/45" : "border border-transparent bg-transparent"
        }`}
      >
        {hasSelection ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium text-indigo-300">已选 {selected.size} 个</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="secondary" icon={<ShieldCheck size={13} />} loading={busy === "status"} onClick={() => checkStatus(false)}>
                检测
              </Button>
              <Button size="sm" variant="accentSoft" icon={<RotateCw size={13} />} loading={busy === "refresh"} onClick={() => refreshTokens(false)}>
                刷新令牌
              </Button>
              <Button size="sm" variant="secondary" icon={<KeyRound size={13} />} loading={busy === "codes"} onClick={() => fetchCodes(false)}>
                验证码
              </Button>
            </div>
            <div className="mx-1 h-5 w-px bg-line" />
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="tealSoft" icon={<Ticket size={13} />} onClick={() => setCardKeyIds(Array.from(selected))}>
                卡密
              </Button>
              <Button size="sm" variant="secondary" icon={<FolderCog size={13} />} onClick={() => setBulkGroupIds(Array.from(selected))}>
                分组
              </Button>
              <Button size="sm" variant="secondary" icon={<Smartphone size={13} />} onClick={() => setTotpIds(Array.from(selected))}>
                2FA
              </Button>
              <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={() => setExportOpen(true)}>
                导出
              </Button>
            </div>
            <div className="mx-1 h-5 w-px bg-line" />
            <Button size="sm" variant="danger" icon={<Trash2 size={13} />} loading={busy === "delete"} onClick={bulkDelete}>
              删除
            </Button>
            <button onClick={() => setSelected(new Set())} className="px-1 text-xs text-muted transition-colors hover:text-slate-100">
              取消选择
            </button>
          </div>
        ) : (
          <div className="h-8" aria-hidden="true" />
        )}
      </div>

      {/* Toolbar: search + filters + utility actions */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => {
            setHeaderSelectionMode("default");
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="搜索邮箱 / 卡密…"
          className={`w-52 ${fieldClass}`}
        />
        <select
          value={groupFilter}
          onChange={(e) => {
            setHeaderSelectionMode("default");
            setGroupFilter(e.target.value);
            setPage(1);
          }}
          className={fieldClass}
        >
          <option value="">全部分组</option>
          <option value="none">未分组</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setHeaderSelectionMode("default");
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className={fieldClass}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setHeaderSelectionMode("default");
            setStaleOnly((v) => !v);
            setPage(1);
          }}
          className={`h-9 rounded-lg border px-3 text-sm transition-colors ${
            staleOnly
              ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
              : "border-line2 bg-surface2 text-muted hover:text-slate-100"
          }`}
        >
          需刷新
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Upload size={14} />} onClick={() => setImportOpen(true)}>
            导入
          </Button>
          <Button variant="secondary" size="sm" icon={<FolderCog size={14} />} onClick={() => setGroupsOpen(true)}>
            分组
          </Button>
          <Button variant="secondary" size="sm" icon={<Settings size={14} />} onClick={() => setSettingsOpen(true)}>
            设置
          </Button>
        </div>
      </div>

      {message && (
        <div className="mb-3 rounded-lg border border-line bg-surface2/60 px-3 py-2 text-xs text-slate-200">
          {message}
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-[1320px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[#141d2d]/95 text-[11px] uppercase tracking-wide text-muted backdrop-blur">
              <tr className="border-b border-line">
                <th className="w-9 px-3 py-2">
                  <label
                    title={headerSelectionLabel}
                    aria-label={headerSelectionLabel}
                    className={`group relative inline-flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                      visibleIds.length === 0
                        ? "cursor-not-allowed border-line/60 bg-surface2/50 text-dim"
                        : "cursor-pointer border-line2 bg-surface2 text-muted hover:border-accent/50 hover:text-indigo-200"
                    } ${
                      allVisibleSelected
                        ? "border-accent/60 bg-accent/20 text-indigo-200"
                        : someVisibleSelected
                          ? "border-accent/45 bg-accent/10 text-indigo-300"
                          : ""
                    } ${
                      selectVisibleFocused ? "border-accent/70 ring-2 ring-accent/30" : ""
                    }`}
                  >
                    <input
                      ref={selectVisibleRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisibleSelection}
                      onFocus={() => setSelectVisibleFocused(true)}
                      onBlur={() => setSelectVisibleFocused(false)}
                      disabled={visibleIds.length === 0}
                      aria-label={headerSelectionLabel}
                      className="sr-only"
                    />
                    {allVisibleSelected ? <Check size={13} /> : someVisibleSelected ? <Minus size={13} /> : null}
                  </label>
                </th>
                <th className="px-3 py-2 text-left font-medium">邮箱</th>
                <th className="px-3 py-2 text-left font-medium">分组</th>
                <th className="px-3 py-2 text-left font-medium">状态</th>
                <th className="px-3 py-2 text-left font-medium">卡密</th>
                <th className="px-3 py-2 text-left font-medium">2FA</th>
                <th className="px-3 py-2 text-left font-medium">令牌有效期</th>
                <th className="px-3 py-2 text-left font-medium">上次刷新</th>
                <th className="px-3 py-2 text-left font-medium">邮箱验证码</th>
                <th className="px-3 py-2 text-left font-medium">验证码时间</th>
                <th className="px-3 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {loading && accounts.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-dim">
                    <RefreshCw size={16} className="mx-auto animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && accounts.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center text-dim">
                    还没有账号，点击右上角「导入」开始。
                  </td>
                </tr>
              )}
              {accounts.map((a) => (
                <tr key={a.id} className="border-l-2 border-l-transparent transition-colors hover:border-l-accent/30 hover:bg-surface2/30">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                      className="accent-accent"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setDrawer(a)}
                      className="max-w-[280px] truncate text-left font-medium text-slate-100 transition-colors hover:text-indigo-300"
                    >
                      {a.email}
                    </button>
                    {a.lastError && (
                      <p className="max-w-xs truncate text-[10px] text-rose-400/70" title={a.lastError}>
                        {a.lastError}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <i
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: a.group?.color ?? "#3b4658" }}
                      />
                      <select
                        value={a.group?.id ?? ""}
                        onChange={(e) => assignGroup(a.id, e.target.value)}
                        disabled={busy === `grp-${a.id}`}
                        className={fieldClassSm}
                      >
                        <option value="">未分组</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-3 py-2">
                    {a.cardKey ? (
                      <button
                        onClick={() => copy(a.cardKey!)}
                        title="点击复制卡密"
                        className="font-mono text-xs text-teal transition-colors hover:text-teal-600"
                      >
                        {a.cardKey}
                      </button>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {a.has2fa ? (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-teal/25 bg-teal/10 text-teal" title="已绑定 2FA">
                        <Smartphone size={13} />
                      </span>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <RiskBadge level={a.riskLevel} days={a.remainingValidityDays} expiresAt={a.refreshTokenExpiresAt} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted">{fmtShort(a.refreshTokenUpdatedAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {a.lastCode ? (
                        <button
                          onClick={() => copy(a.lastCode!)}
                          title="点击复制"
                          className="font-mono text-sm tracking-wider text-emerald-300 transition-colors hover:text-emerald-200"
                        >
                          {a.lastCode}
                        </button>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                      <button
                        onClick={() => fetchCodeRow(a.id)}
                        disabled={busy === `code-${a.id}`}
                        title="获取最新验证码"
                        className="text-dim transition-colors hover:text-indigo-300 disabled:opacity-50"
                      >
                        {busy === `code-${a.id}` ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : (
                          <RotateCw size={12} />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted">{fmtShort(a.lastCodeAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end">
                      <IconButton title="查看 / 收件箱" onClick={() => setDrawer(a)}>
                        <Mail size={15} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination + page size */}
      {(data?.total ?? 0) > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted">
            <span>每页</span>
            <input
              key={pageSize}
              type="number"
              min={1}
              max={1000}
              defaultValue={pageSize}
              onBlur={(e) => applyPageSize(Number(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className={`w-16 text-center ${fieldClassSm}`}
            />
            <span>个</span>
            {[20, 50, 100, 200].map((n) => (
              <button
                key={n}
                onClick={() => applyPageSize(n)}
                className={`h-7 rounded-md border px-2 text-xs transition-colors ${
                  pageSize === n
                    ? "border-accent/50 bg-accent/15 text-indigo-300"
                    : "border-line2 text-muted hover:text-slate-100"
                }`}
              >
                {n}
              </button>
            ))}
            <span className="ml-1 text-dim">共 {data?.total ?? 0} 个</span>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setHeaderSelectionMode("default");
                  setPage((p) => Math.max(1, p - 1));
                }}
                disabled={page <= 1}
              >
                上一页
              </Button>
              <span className="text-muted">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setHeaderSelectionMode("default");
                  setPage((p) => Math.min(totalPages, p + 1));
                }}
                disabled={page >= totalPages}
              >
                下一页
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Overlays */}
      {importOpen && (
        <ImportDialog
          groups={groups}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            void loadAccounts();
            void loadGroups();
          }}
        />
      )}
      {groupsOpen && (
        <GroupsDialog groups={groups} onClose={() => setGroupsOpen(false)} onChanged={loadGroups} />
      )}
      {bulkGroupIds && (
        <BulkGroupDialog
          ids={bulkGroupIds}
          groups={groups}
          onClose={() => setBulkGroupIds(null)}
          onDone={() => {
            void loadAccounts();
            void loadGroups();
          }}
        />
      )}
      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} onSaved={(c) => setConfig(c)} />
      )}
      {cardKeyIds && (
        <CardKeyDialog ids={cardKeyIds} onClose={() => setCardKeyIds(null)} onDone={loadAccounts} />
      )}
      {totpIds && (
        <TotpDialog ids={totpIds} onClose={() => setTotpIds(null)} onDone={loadAccounts} />
      )}
      {exportOpen && <ExportDialog ids={Array.from(selected)} onClose={() => setExportOpen(false)} />}
      {drawer && (
        <AccountDrawer account={drawer} onClose={() => setDrawer(null)} onChanged={loadAccounts} />
      )}
    </div>
  );
}
