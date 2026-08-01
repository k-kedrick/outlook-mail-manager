import type { MailAccount } from "@prisma/client";
import { ImapFlow, type FetchMessageObject, type ListResponse, type MessageStructureObject } from "imapflow";
import { getAccessToken } from "./oauth";
import type { MailFolder, MailMessage } from "./mail";

const IMAP_HOST = "outlook.office365.com";
const LIST_SOURCE_LIMIT = 512 * 1024;
const DETAIL_SOURCE_LIMIT = 2 * 1024 * 1024;
const JUNK_NAMES = new Set(["junk email", "junk", "spam"]);

type ImapMessageId = { version: 1; path: string; uidValidity: string; uid: number };

export class ImapReadError extends Error {
  readonly stage: "connect" | "folder" | "fetch" | "message";
  readonly authenticationFailed: boolean;

  constructor(stage: ImapReadError["stage"], message: string, authenticationFailed = false) {
    super(message);
    this.name = "ImapReadError";
    this.stage = stage;
    this.authenticationFailed = authenticationFailed;
  }
}

export function encodeImapMessageId(payload: Omit<ImapMessageId, "version">): string {
  return Buffer.from(JSON.stringify({ version: 1, ...payload } satisfies ImapMessageId)).toString("base64url");
}

export function decodeImapMessageId(value: string): ImapMessageId {
  try {
    if (!value || value.length > 2048) throw new Error("invalid");
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ImapMessageId>;
    if (
      parsed.version !== 1 ||
      typeof parsed.path !== "string" ||
      !parsed.path ||
      parsed.path.length > 512 ||
      typeof parsed.uidValidity !== "string" ||
      !/^\d+$/.test(parsed.uidValidity) ||
      !Number.isSafeInteger(parsed.uid) ||
      (parsed.uid ?? 0) <= 0
    ) {
      throw new Error("invalid");
    }
    return parsed as ImapMessageId;
  } catch {
    throw new ImapReadError("message", "IMAP 邮件标识无效。");
  }
}

function createClient(account: MailAccount, accessToken: string): ImapFlow {
  return new ImapFlow({
    host: IMAP_HOST,
    port: 993,
    secure: true,
    auth: { user: account.email, accessToken },
    logger: false,
    logRaw: false,
    emitLogs: false,
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    maxLiteralSize: DETAIL_SOURCE_LIMIT + 128 * 1024,
    maxLockHoldTime: 30_000,
    clientInfo: { name: "Outlook Mail Manager", version: "0.1.0" },
  });
}

async function withClient<T>(account: MailAccount, action: (client: ImapFlow) => Promise<T>): Promise<T> {
  const accessToken = await getAccessToken(account, "imap");
  const client = createClient(account, accessToken);
  try {
    await client.connect();
    return await action(client);
  } catch (error) {
    if (error instanceof ImapReadError) throw error;
    const candidate = error as { authenticationFailed?: boolean; name?: string; code?: string } | null;
    const authFailed = Boolean(
      candidate?.authenticationFailed ||
      candidate?.name === "AuthenticationFailure" ||
      /AUTHENTICATIONFAILED|AUTHORIZATIONFAILED/i.test(candidate?.code ?? ""),
    );
    const stage: ImapReadError["stage"] = client.authenticated ? "fetch" : "connect";
    throw new ImapReadError(stage, authFailed ? "IMAP OAuth2 登录被拒绝。" : "IMAP 服务暂时不可用。", authFailed);
  } finally {
    try {
      if (client.usable) await client.logout();
      else client.close();
    } catch {
      client.close();
    }
  }
}

export function resolveImapFolder(folder: MailFolder, mailboxes: ListResponse[]): string {
  if (folder === "inbox") return "INBOX";
  const special = mailboxes.find((mailbox) => mailbox.specialUse?.toLowerCase() === "\\junk");
  if (special) return special.path;
  const fallback = mailboxes.find((mailbox) => JUNK_NAMES.has(mailbox.path.trim().toLowerCase()));
  if (fallback) return fallback.path;
  throw new ImapReadError("folder", "未找到垃圾邮件文件夹。");
}

async function mailboxPath(client: ImapFlow, folder: MailFolder): Promise<string> {
  if (folder === "inbox") return "INBOX";
  return resolveImapFolder(folder, await client.list());
}

function receivedAt(message: FetchMessageObject): string | null {
  const value = message.envelope?.date ?? message.internalDate;
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function textParts(structure: MessageStructureObject | undefined): { text?: string; html?: string } {
  const result: { text?: string; html?: string } = {};
  const visit = (node: MessageStructureObject, root = false): void => {
    const type = node.type.toLowerCase();
    const isAttachment = node.disposition?.toLowerCase() === "attachment";
    const part = node.part ?? (root ? "1" : undefined);
    if (!isAttachment && part && type === "text/plain" && !result.text) result.text = part;
    if (!isAttachment && part && type === "text/html" && !result.html) result.html = part;
    node.childNodes?.forEach((child) => visit(child));
  };
  if (structure) visit(structure, true);
  return result;
}

async function streamText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function loadBody(
  client: ImapFlow,
  message: FetchMessageObject,
  maxBytes: number,
): Promise<{ bodyText: string | null; bodyHtml: string | null }> {
  const parts = textParts(message.bodyStructure);
  const load = async (part: string | undefined): Promise<string | null> => {
    if (!part) return null;
    const downloaded = await client.download(String(message.uid), part, { uid: true, maxBytes });
    return downloaded?.content ? streamText(downloaded.content) : null;
  };
  const bodyText = await load(parts.text);
  const bodyHtml = await load(parts.html);
  return { bodyText, bodyHtml };
}

function htmlPreview(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapMessage(
  message: FetchMessageObject,
  path: string,
  uidValidity: bigint,
  body: { bodyText: string | null; bodyHtml: string | null } = { bodyText: null, bodyHtml: null },
): MailMessage {
  const envelopeFrom = message.envelope?.from?.[0];
  const preview = body.bodyText ?? (body.bodyHtml ? htmlPreview(body.bodyHtml) : "");

  return {
    id: encodeImapMessageId({ path, uidValidity: uidValidity.toString(), uid: message.uid }),
    source: "imap",
    from: envelopeFrom?.address ?? "",
    fromName: envelopeFrom?.name ?? null,
    subject: message.envelope?.subject ?? "(无主题)",
    receivedAt: receivedAt(message),
    preview: preview.slice(0, 240),
    isRead: Boolean(message.flags?.has("\\Seen")),
    bodyHtml: body.bodyHtml,
    bodyText: body.bodyText,
  };
}

export async function imapInbox(
  account: MailAccount,
  { limit, offset, withBody, folder }: { limit: number; offset: number; withBody: boolean; folder: MailFolder },
): Promise<MailMessage[]> {
  return withClient(account, async (client) => {
    const path = await mailboxPath(client, folder);
    const lock = await client.getMailboxLock(path, { readOnly: true, acquireTimeout: 10_000 });
    try {
      if (!client.mailbox) throw new ImapReadError("folder", "无法打开 IMAP 文件夹。");
      const end = client.mailbox.exists - offset;
      if (end <= 0) return [];
      const start = Math.max(1, end - limit + 1);
      const messages = await client.fetchAll(`${start}:${end}`, {
        envelope: true,
        flags: true,
        internalDate: true,
        bodyStructure: withBody,
      });
      const uidValidity = client.mailbox.uidValidity;
      return Promise.all(
        messages.sort((a, b) => b.seq - a.seq).map(async (message) =>
          mapMessage(message, path, uidValidity, withBody ? await loadBody(client, message, LIST_SOURCE_LIMIT) : undefined),
        ),
      );
    } finally {
      lock.release();
    }
  });
}

export async function imapMessage(account: MailAccount, id: string): Promise<MailMessage> {
  const decoded = decodeImapMessageId(id);
  return withClient(account, async (client) => {
    const lock = await client.getMailboxLock(decoded.path, { readOnly: true, acquireTimeout: 10_000 });
    try {
      if (!client.mailbox || client.mailbox.uidValidity.toString() !== decoded.uidValidity) {
        throw new ImapReadError("message", "IMAP 邮箱版本已变化，请重新加载邮件列表。");
      }
      const message = await client.fetchOne(String(decoded.uid), {
        envelope: true,
        flags: true,
        internalDate: true,
        bodyStructure: true,
      }, { uid: true });
      if (!message) throw new ImapReadError("message", "邮件不存在或已被删除。");
      return mapMessage(
        message,
        decoded.path,
        client.mailbox.uidValidity,
        await loadBody(client, message, DETAIL_SOURCE_LIMIT),
      );
    } finally {
      lock.release();
    }
  });
}

export async function probeImap(account: MailAccount): Promise<void> {
  await withClient(account, async (client) => {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true, acquireTimeout: 10_000 });
    lock.release();
  });
}
