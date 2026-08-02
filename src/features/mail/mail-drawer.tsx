"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/features/api/client";
import type { Account } from "@/features/accounts/types";

type Message = { id: string; protocol: string; folder: "inbox" | "junk"; from: string; fromName: string | null; subject: string; receivedAt: string | null; preview: string; isRead: boolean; bodyText: string | null; bodyHtml: string | null };
type MailPage = { messages: Message[]; nextCursor: string | null };

export function MailDrawer({ account, onClose }: { account: Account | null; onClose: () => void }): React.ReactNode {
  const [folder, setFolder] = useState<"inbox" | "junk">("inbox");
  const [selected, setSelected] = useState<Message | null>(null);
  const mail = useInfiniteQuery({
    queryKey: ["mail", account?.id, folder],
    enabled: Boolean(account),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => apiRequest<MailPage>(`/api/v2/accounts/${account?.id}/mail?folder=${folder}&limit=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (page) => page.nextCursor,
  });
  const detail = useQuery({
    queryKey: ["mail-detail", account?.id, selected?.id],
    enabled: Boolean(account && selected),
    queryFn: () => apiRequest<Message>(`/api/v2/accounts/${account?.id}/mail/${encodeURIComponent(selected?.id ?? "")}?folder=${selected?.folder ?? folder}`),
  });
  if (!account) return null;
  const messages = mail.data?.pages.flatMap((page) => page.messages) ?? [];
  return <div className="fixed inset-0 z-30 bg-black/55" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="ml-auto flex h-full w-full max-w-3xl flex-col border-l border-line bg-bg shadow-2xl"><header className="flex items-start justify-between border-b border-line p-4"><div><h2 className="font-semibold text-slate-100">{account.email}</h2><p className="text-xs text-muted">Graph → IMAP，legacy REST 仅在能力可用时参与</p></div><button className="secondary-button" onClick={onClose}><X size={16} /></button></header><div className="flex border-b border-line px-4"><Tab active={folder === "inbox"} onClick={() => { setFolder("inbox"); setSelected(null); }}>收件箱</Tab><Tab active={folder === "junk"} onClick={() => { setFolder("junk"); setSelected(null); }}>垃圾邮件</Tab></div><div className="grid min-h-0 flex-1 md:grid-cols-[320px_1fr]"><div className="overflow-y-auto border-r border-line">{mail.isPending && <Notice>正在读取邮件…</Notice>}{mail.isError && <Notice>当前通道读取失败，请稍后重试或执行能力探测。</Notice>}{messages.map((message) => <button key={message.id} onClick={() => setSelected(message)} className={`block w-full border-b border-line p-3 text-left hover:bg-surface2 ${selected?.id === message.id ? "bg-surface2" : ""}`}><p className="truncate text-sm font-medium text-slate-100">{message.subject || "（无主题）"}</p><p className="mt-1 truncate text-xs text-muted">{message.fromName || message.from}</p><p className="mt-1 truncate text-xs text-dim">{message.preview}</p></button>)}{mail.hasNextPage && <button className="m-3 secondary-button w-[calc(100%-1.5rem)]" onClick={() => mail.fetchNextPage()} disabled={mail.isFetchingNextPage}>加载更多</button>}</div><article className="overflow-y-auto p-5">{!selected ? <Notice>选择一封邮件查看正文。</Notice> : detail.isPending ? <Notice>正在加载正文…</Notice> : detail.data ? <><h3 className="text-lg font-semibold">{detail.data.subject}</h3><p className="my-3 text-xs text-muted">{detail.data.from} · {detail.data.receivedAt ? new Date(detail.data.receivedAt).toLocaleString("zh-CN") : "时间未知"} · {detail.data.protocol}</p>{detail.data.bodyHtml ? <iframe sandbox="" title="邮件正文" srcDoc={detail.data.bodyHtml} className="h-[70vh] w-full rounded-lg border border-line bg-white" /> : <pre className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{detail.data.bodyText}</pre>}</> : <Notice>正文读取失败。</Notice>}</article></div></aside></div>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }): React.ReactNode { return <button onClick={onClick} className={`border-b-2 px-4 py-3 text-sm ${active ? "border-accent text-indigo-200" : "border-transparent text-muted"}`}>{children}</button>; }
function Notice({ children }: { children: React.ReactNode }): React.ReactNode { return <p className="p-5 text-sm text-muted">{children}</p>; }
