import { Inbox, Radio, ShieldAlert } from "lucide-react";
import type { Account } from "./types";

export function AccountTable({
  accounts,
  onOpen,
  onProbe,
  onAuthorizeGraph,
  onAuthorizeImap,
  selectedIds,
  onToggle,
}: {
  accounts: Account[];
  onOpen: (account: Account) => void;
  onProbe: (account: Account) => void;
  onAuthorizeGraph: (account: Account) => void;
  onAuthorizeImap: (account: Account) => void;
  selectedIds: Set<string>;
  onToggle: (accountId: string) => void;
}): React.ReactNode {
  if (!accounts.length) return <div className="rounded-xl border border-dashed border-line2 py-16 text-center text-sm text-muted">暂无账号。可通过 Microsoft 标准授权或批量 Refresh Token 导入添加。</div>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-surface2/70 text-xs text-muted"><tr><th className="w-10 px-4 py-3"></th><th className="py-3">账号</th><th>分组</th><th>类型</th><th>协议能力</th><th>OAuth Grant</th><th>状态</th><th className="pr-4 text-right">操作</th></tr></thead>
        <tbody className="divide-y divide-line">
          {accounts.map((account) => {
            const graphGrant = account.grants.find((grant) => grant.resource === "graph");
            const hasGraph = graphGrant?.status === "active";
            const hasImap = account.grants.some((grant) => grant.resource === "outlook_imap" && grant.status === "active");
            return (
              <tr key={account.id} className="hover:bg-surface2/35">
                <td className="px-4"><input type="checkbox" checked={selectedIds.has(account.id)} onChange={() => onToggle(account.id)} className="accent-indigo-500" /></td>
                <td className="py-3"><button onClick={() => onOpen(account)} className="font-medium text-slate-100 hover:text-teal">{account.email}</button><p className="mt-1 text-xs text-dim">{account.preferredProtocol ?? "自动路由"}</p></td>
                <td className="text-xs text-muted">{account.group ? <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: account.group.color ?? "#64748b" }} />{account.group.name}</span> : "—"}</td>
                <td className="text-xs text-muted">{account.accountType}</td>
                <td><div className="flex gap-1.5">{["graph", "imap", "outlook_rest_legacy"].map((protocol) => { const capability = account.capabilities.find((item) => item.protocol === protocol); return <CapabilityBadge key={protocol} name={protocol} state={capability?.state ?? "unknown"} />; })}</div></td>
                <td className="text-xs"><span className={hasGraph ? "text-emerald-300" : "text-dim"}>Graph {hasGraph ? "✓" : "—"}</span><span className="mx-2 text-line2">|</span><span className={hasImap ? "text-emerald-300" : "text-dim"}>IMAP {hasImap ? "✓" : "—"}</span></td>
                <td><span className={account.status === "healthy" ? "text-emerald-300" : "text-amber-300"}>{account.status}</span></td>
                <td className="pr-4 text-right"><div className="flex justify-end gap-2"><button className="secondary-button" onClick={() => onProbe(account)} title="异步探测"><Radio size={15} /></button>{!hasGraph && <button className="secondary-button" onClick={() => onAuthorizeGraph(account)}>授权 Graph</button>}{hasGraph && !hasImap && <button className="secondary-button" onClick={() => onAuthorizeImap(account)}>授权 IMAP</button>}<button className="secondary-button" onClick={() => onOpen(account)}><Inbox size={15} /></button></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CapabilityBadge({ name, state }: { name: string; state: string }): React.ReactNode {
  const style = state === "available" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : state === "denied" || state === "disabled" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-line2 bg-surface2 text-muted";
  return <span title={state} className={`rounded-md border px-1.5 py-1 text-[10px] uppercase ${style}`}>{state === "denied" ? <ShieldAlert className="mr-1 inline" size={10} /> : null}{name.replace("outlook_rest_legacy", "rest")}</span>;
}
