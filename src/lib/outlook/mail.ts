import type { MailAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAccessToken, OAuthError } from "./oauth";

// "outlook" = Outlook REST API over HTTPS (outlook.office.com/api/v2.0), the path
// that works for these MSA/bulk accounts. "graph" = Microsoft Graph, a fallback
// for accounts whose app registration consents Graph scopes.
export type MailSource = "graph" | "outlook";
export type MailFolder = "inbox" | "junk";

export type MailMessage = {
  id: string;
  source: MailSource;
  from: string;
  fromName: string | null;
  subject: string;
  receivedAt: string | null;
  preview: string;
  isRead: boolean;
  bodyHtml: string | null;
  bodyText: string | null;
};

export type InboxResult = {
  source: MailSource;
  messages: MailMessage[];
};

class ReadError extends Error {
  httpStatus: number;
  constructor(label: string, httpStatus: number, body: string) {
    super(`${label} 请求失败 (${httpStatus}): ${body.slice(0, 200)}`);
    this.name = "ReadError";
    this.httpStatus = httpStatus;
  }
}

// ---------------------------------------------------------------------------
// Outlook REST API (outlook.office.com/api/v2.0) — primary
// ---------------------------------------------------------------------------

const OUTLOOK_BASE = "https://outlook.office.com/api/v2.0";

function outlookFolder(folder: MailFolder): string {
  return folder === "junk" ? "JunkEmail" : "Inbox";
}

type RestMessage = {
  Id: string;
  Subject?: string;
  BodyPreview?: string;
  IsRead?: boolean;
  ReceivedDateTime?: string;
  From?: { EmailAddress?: { Name?: string; Address?: string } };
  Body?: { ContentType?: string; Content?: string };
};

function mapRest(msg: RestMessage, withBody: boolean): MailMessage {
  const address = msg.From?.EmailAddress?.Address ?? "";
  const name = msg.From?.EmailAddress?.Name ?? null;
  const isHtml = (msg.Body?.ContentType ?? "").toLowerCase() === "html";
  return {
    id: msg.Id,
    source: "outlook",
    from: address,
    fromName: name,
    subject: msg.Subject || "(无主题)",
    receivedAt: msg.ReceivedDateTime ?? null,
    preview: msg.BodyPreview ?? "",
    isRead: Boolean(msg.IsRead),
    bodyHtml: withBody && isHtml ? msg.Body?.Content ?? null : null,
    bodyText: withBody && !isHtml ? msg.Body?.Content ?? null : null,
  };
}

async function outlookGet<T>(account: MailAccount, path: string): Promise<T> {
  const token = await getAccessToken(account, "imap"); // outlook.office.com-scoped token
  const res = await fetch(`${OUTLOOK_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new ReadError("Outlook", res.status, await res.text().catch(() => ""));
  return (await res.json()) as T;
}

async function outlookInbox(
  account: MailAccount,
  limit: number,
  withBody: boolean,
  folder: MailFolder,
  offset: number,
): Promise<MailMessage[]> {
  const select = ["Id", "Subject", "From", "ReceivedDateTime", "BodyPreview", "IsRead"];
  if (withBody) select.push("Body");
  const path =
    `/me/MailFolders/${outlookFolder(folder)}/messages` +
    `?$top=${limit}&$skip=${offset}&$orderby=ReceivedDateTime%20desc&$select=${select.join(",")}`;
  const data = await outlookGet<{ value?: RestMessage[] }>(account, path);
  return (data.value ?? []).map((m) => mapRest(m, withBody));
}

async function outlookMessage(account: MailAccount, id: string): Promise<MailMessage> {
  const path =
    `/me/messages/${encodeURIComponent(id)}` +
    `?$select=Id,Subject,From,ReceivedDateTime,BodyPreview,IsRead,Body`;
  const data = await outlookGet<RestMessage>(account, path);
  return mapRest(data, true);
}

// ---------------------------------------------------------------------------
// Microsoft Graph — fallback for Graph-consented accounts
// ---------------------------------------------------------------------------

type GraphMessage = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  isRead?: boolean;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
};

function graphFolder(folder: MailFolder): string {
  return folder === "junk" ? "junkemail" : "inbox";
}

function mapGraph(msg: GraphMessage, withBody: boolean): MailMessage {
  const address = msg.from?.emailAddress?.address ?? "";
  const name = msg.from?.emailAddress?.name ?? null;
  const isHtml = (msg.body?.contentType ?? "").toLowerCase() === "html";
  return {
    id: msg.id,
    source: "graph",
    from: address,
    fromName: name,
    subject: msg.subject ?? "(无主题)",
    receivedAt: msg.receivedDateTime ?? null,
    preview: msg.bodyPreview ?? "",
    isRead: Boolean(msg.isRead),
    bodyHtml: withBody && isHtml ? msg.body?.content ?? null : null,
    bodyText: withBody && !isHtml ? msg.body?.content ?? null : null,
  };
}

async function graphGet<T>(account: MailAccount, path: string): Promise<T> {
  const token = await getAccessToken(account, "graph");
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ReadError("Graph", res.status, await res.text().catch(() => ""));
  return (await res.json()) as T;
}

async function graphInbox(
  account: MailAccount,
  limit: number,
  withBody: boolean,
  folder: MailFolder,
  offset: number,
): Promise<MailMessage[]> {
  const select = ["id", "subject", "from", "receivedDateTime", "bodyPreview", "isRead"];
  if (withBody) select.push("body");
  const path =
    `/me/mailFolders/${graphFolder(folder)}/messages` +
    `?$top=${limit}&$skip=${offset}&$orderby=receivedDateTime%20desc&$select=${select.join(",")}`;
  const data = await graphGet<{ value?: GraphMessage[] }>(account, path);
  return (data.value ?? []).map((m) => mapGraph(m, withBody));
}

async function graphMessage(account: MailAccount, id: string): Promise<MailMessage> {
  const path =
    `/me/messages/${encodeURIComponent(id)}` +
    `?$select=id,subject,from,receivedDateTime,bodyPreview,isRead,body`;
  return mapGraph(await graphGet<GraphMessage>(account, path), true);
}

// ---------------------------------------------------------------------------
// Public API — try the account's learned protocol first, then the other
// ---------------------------------------------------------------------------

function preferError(outlookErr: unknown, graphErr: unknown): Error {
  if (graphErr === undefined && outlookErr instanceof Error) return outlookErr;
  if (outlookErr === undefined && graphErr instanceof Error) return graphErr;
  // A dead refresh token surfaces as OAuthError from both paths — prefer it.
  if (outlookErr instanceof OAuthError) return outlookErr;
  if (graphErr instanceof OAuthError) return graphErr;
  const o = outlookErr instanceof Error ? outlookErr.message : String(outlookErr);
  const g = graphErr instanceof Error ? graphErr.message : String(graphErr);
  return new Error(`读取失败。Outlook: ${o} | Graph: ${g}`);
}

function protocolOrder(account: MailAccount): MailSource[] {
  // Outlook REST is what works for these accounts; try it first unless the
  // account is known to use Graph.
  if (account.mailProtocol === "graph") return ["graph", "outlook"];
  return ["outlook", "graph"];
}

async function persistProtocol(account: MailAccount, proto: MailSource): Promise<void> {
  if (account.mailProtocol === proto) return;
  account.mailProtocol = proto;
  await prisma.mailAccount
    .update({ where: { id: account.id }, data: { mailProtocol: proto } })
    .catch(() => {});
}

export async function fetchInbox(
  account: MailAccount,
  {
    limit = 20,
    withBody = false,
    folder = "inbox",
    offset = 0,
  }: { limit?: number; withBody?: boolean; folder?: MailFolder; offset?: number } = {},
): Promise<InboxResult> {
  const errors: Partial<Record<MailSource, unknown>> = {};
  for (const proto of protocolOrder(account)) {
    try {
      const messages =
        proto === "outlook"
          ? await outlookInbox(account, limit, withBody, folder, offset)
          : await graphInbox(account, limit, withBody, folder, offset);
      await persistProtocol(account, proto);
      return { source: proto, messages };
    } catch (err) {
      errors[proto] = err;
    }
  }
  throw preferError(errors.outlook, errors.graph);
}

export type FolderedMailMessage = MailMessage & { folder: MailFolder };
export type FolderPage = { loaded: number; nextOffset: number; hasMore: boolean };

/** Fetch Inbox and Junk concurrently and merge into one time-sorted list. Junk failures degrade silently. */
export async function fetchInboxAndJunk(
  account: MailAccount,
  {
    limit = 20,
    withBody = false,
    inboxOffset = 0,
    junkOffset = 0,
  }: { limit?: number; withBody?: boolean; inboxOffset?: number; junkOffset?: number } = {},
): Promise<{
  source: MailSource;
  messages: FolderedMailMessage[];
  junkError: string | null;
  folders: { inbox: FolderPage; junk: FolderPage };
}> {
  const [inboxRes, junkRes] = await Promise.allSettled([
    fetchInbox(account, { limit, withBody, folder: "inbox", offset: inboxOffset }),
    fetchInbox(account, { limit, withBody, folder: "junk", offset: junkOffset }),
  ]);

  if (inboxRes.status === "rejected") throw inboxRes.reason;
  const inboxMessages: FolderedMailMessage[] = inboxRes.value.messages.map((m) => ({ ...m, folder: "inbox" }));

  let junkMessages: FolderedMailMessage[] = [];
  let junkError: string | null = null;
  if (junkRes.status === "fulfilled") {
    junkMessages = junkRes.value.messages.map((m) => ({ ...m, folder: "junk" }));
  } else {
    junkError = junkRes.reason instanceof Error ? junkRes.reason.message : String(junkRes.reason);
  }

  const merged = [...inboxMessages, ...junkMessages].sort(
    (a, b) => new Date(b.receivedAt ?? 0).getTime() - new Date(a.receivedAt ?? 0).getTime(),
  );
  return {
    source: inboxRes.value.source,
    messages: merged,
    junkError,
    folders: {
      inbox: {
        loaded: inboxMessages.length,
        nextOffset: inboxOffset + inboxMessages.length,
        hasMore: inboxMessages.length === limit,
      },
      junk: {
        loaded: junkMessages.length,
        nextOffset: junkOffset + junkMessages.length,
        hasMore: !junkError && junkMessages.length === limit,
      },
    },
  };
}

export async function fetchMessage(
  account: MailAccount,
  id: string,
  source?: MailSource,
): Promise<MailMessage> {
  const proto = source ?? (account.mailProtocol as MailSource | null) ?? null;
  if (proto === "graph") return graphMessage(account, id);
  if (proto === "outlook") return outlookMessage(account, id);
  // Unknown hint: Graph ids contain '=' / '-' and are long; default to Outlook.
  return outlookMessage(account, id);
}
