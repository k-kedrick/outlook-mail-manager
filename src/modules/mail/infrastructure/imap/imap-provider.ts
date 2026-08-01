import { ImapFlow, type FetchMessageObject, type ImapFlowOptions, type ListResponse, type MessageStructureObject } from "imapflow";
import type {
  GetMessageInput,
  ListMessagesInput,
  MailFolder,
  MailMessage,
  MailPage,
  MailProvider,
  ProbeInput,
  ProbeResult,
} from "../../domain/mail-provider";
import { decodeMailToken, encodeMailToken } from "../../domain/opaque-token";
import { ProviderError } from "../../domain/provider-error";
import { env } from "@/shared/config/env";
import { Semaphore } from "@/shared/concurrency/semaphore";

const HOST = "outlook.office365.com";
const DETAIL_LIMIT = 2 * 1024 * 1024;
const CURSOR_TTL_MS = 15 * 60_000;
const JUNK_NAMES = new Set(["junk email", "junk", "spam"]);

type ImapReference = { path: string; uidValidity: string; uid: number };
type ImapCursor = { path: string; uidValidity: string; nextSequence: number };

function parseJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new ProviderError("INVALID_CURSOR", false, "Invalid IMAP reference");
  }
}

export function imapClientOptions(email: string, accessToken: string): ImapFlowOptions {
  return {
    host: HOST,
    port: 993,
    secure: true,
    auth: { user: email, accessToken },
    logger: false,
    logRaw: false,
    emitLogs: false,
    disableAutoIdle: true,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    maxLiteralSize: DETAIL_LIMIT + 128 * 1024,
    maxLockHoldTime: 30_000,
    clientInfo: { name: "Outlook Mail Manager", version: "2.0.0" },
  };
}

function createClient(email: string, accessToken: string): ImapFlow {
  return new ImapFlow(imapClientOptions(email, accessToken));
}

export type ImapClientFactory = (email: string, accessToken: string) => ImapFlow;

function mapImapError(error: unknown, authenticated: boolean): ProviderError {
  if (error instanceof ProviderError) return error;
  const candidate = error as { authenticationFailed?: boolean; name?: string; code?: string; responseText?: string } | null;
  const code = `${candidate?.code ?? ""} ${candidate?.responseText ?? ""}`;
  if (
    candidate?.authenticationFailed ||
    candidate?.name === "AuthenticationFailure" ||
    /AUTHENTICATIONFAILED|AUTHORIZATIONFAILED/i.test(code)
  ) {
    return new ProviderError("PERMISSION_DENIED", false, "IMAP OAuth2 authentication denied");
  }
  if (/NONEXISTENT|MAILBOX.*DISABLED/i.test(code)) {
    return new ProviderError("MAILBOX_DISABLED", false, "IMAP mailbox is unavailable");
  }
  return new ProviderError(authenticated ? "PROVIDER_UNAVAILABLE" : "NETWORK_ERROR", true, "IMAP unavailable");
}

async function withClientUnbounded<T>(
  clientFactory: ImapClientFactory,
  email: string,
  token: string,
  action: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = clientFactory(email, token);
  try {
    await client.connect();
    return await action(client);
  } catch (error) {
    throw mapImapError(error, Boolean(client.authenticated));
  } finally {
    try {
      if (client.usable) await client.logout();
      else client.close();
    } catch {
      client.close();
    }
  }
}

let imapSemaphore: Semaphore | undefined;
function withClient<T>(clientFactory: ImapClientFactory, email: string, token: string, action: (client: ImapFlow) => Promise<T>): Promise<T> {
  imapSemaphore ??= new Semaphore(env().IMAP_CONCURRENCY);
  return imapSemaphore.run(() => withClientUnbounded(clientFactory, email, token, action));
}

function resolveFolder(folder: MailFolder, mailboxes: ListResponse[]): string {
  if (folder === "inbox") return "INBOX";
  const special = mailboxes.find((mailbox) => mailbox.specialUse?.toLowerCase() === "\\junk");
  if (special) return special.path;
  const fallback = mailboxes.find((mailbox) => JUNK_NAMES.has(mailbox.path.trim().toLowerCase()));
  if (fallback) return fallback.path;
  throw new ProviderError("MAILBOX_DISABLED", false, "IMAP junk folder was not found");
}

async function folderPath(client: ImapFlow, folder: MailFolder): Promise<string> {
  return folder === "inbox" ? "INBOX" : resolveFolder(folder, await client.list());
}

function messageDate(message: FetchMessageObject): string | null {
  const value = message.envelope?.date ?? message.internalDate;
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function bodyParts(structure: MessageStructureObject | undefined): { text?: string; html?: string } {
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

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function loadBody(client: ImapFlow, message: FetchMessageObject): Promise<{
  bodyText: string | null;
  bodyHtml: string | null;
}> {
  const parts = bodyParts(message.bodyStructure);
  const download = async (part?: string): Promise<string | null> => {
    if (!part) return null;
    const result = await client.download(String(message.uid), part, {
      uid: true,
      maxBytes: DETAIL_LIMIT,
    });
    return result?.content ? readStream(result.content) : null;
  };
  return { bodyText: await download(parts.text), bodyHtml: await download(parts.html) };
}

function htmlPreview(value: string): string {
  return value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapMessage(
  message: FetchMessageObject,
  folder: MailFolder,
  path: string,
  uidValidity: bigint,
  body: { bodyText: string | null; bodyHtml: string | null } = { bodyText: null, bodyHtml: null },
): MailMessage {
  const from = message.envelope?.from?.[0];
  const reference: ImapReference = { path, uidValidity: uidValidity.toString(), uid: message.uid };
  const preview = body.bodyText ?? (body.bodyHtml ? htmlPreview(body.bodyHtml) : "");
  return {
    id: encodeMailToken({
      version: 1,
      kind: "message",
      protocol: "imap",
      folder,
      value: JSON.stringify(reference),
    }),
    protocol: "imap",
    folder,
    from: from?.address ?? "",
    fromName: from?.name ?? null,
    subject: message.envelope?.subject ?? "(无主题)",
    receivedAt: messageDate(message),
    preview: preview.slice(0, 240),
    isRead: Boolean(message.flags?.has("\\Seen")),
    bodyText: body.bodyText,
    bodyHtml: body.bodyHtml,
  };
}

export class ImapMailProvider implements MailProvider {
  readonly protocol = "imap" as const;

  constructor(private readonly clientFactory: ImapClientFactory = createClient) {}

  async probe(input: ProbeInput): Promise<ProbeResult> {
    const startedAt = Date.now();
    const token = await input.resolveToken(input.account.id, "imap_mail");
    await withClient(this.clientFactory, input.account.email, token, async (client) => {
      const lock = await client.getMailboxLock("INBOX", { readOnly: true, acquireTimeout: 10_000 });
      lock.release();
    });
    return { available: true, latencyMs: Date.now() - startedAt };
  }

  async listMessages(input: ListMessagesInput): Promise<MailPage> {
    const token = await input.resolveToken(input.account.id, "imap_mail");
    return withClient(this.clientFactory, input.account.email, token, async (client) => {
      const path = await folderPath(client, input.folder);
      const lock = await client.getMailboxLock(path, { readOnly: true, acquireTimeout: 10_000 });
      try {
        const mailbox = client.mailbox;
        if (!mailbox) throw new ProviderError("MAILBOX_DISABLED", false, "IMAP folder unavailable");
        const uidValidity = mailbox.uidValidity.toString();
        let end = mailbox.exists;
        if (input.cursor) {
          const opaque = decodeMailToken(input.cursor, "cursor");
          if (opaque.protocol !== "imap" || opaque.folder !== input.folder) {
            throw new ProviderError("INVALID_CURSOR", false, "IMAP cursor mismatch");
          }
          const cursor = parseJson<ImapCursor>(opaque.value);
          if (cursor.path !== path || cursor.uidValidity !== uidValidity) {
            throw new ProviderError("CURSOR_EXPIRED", false, "IMAP mailbox version changed");
          }
          end = cursor.nextSequence;
        }
        if (end <= 0) return { messages: [], nextCursor: null };
        const limit = Math.min(100, Math.max(1, input.limit));
        const start = Math.max(1, end - limit + 1);
        const messages = await client.fetchAll(`${start}:${end}`, {
          envelope: true,
          flags: true,
          internalDate: true,
        });
        messages.sort((left, right) => right.seq - left.seq);
        return {
          messages: messages.map((message) => mapMessage(message, input.folder, path, mailbox.uidValidity)),
          nextCursor:
            start > 1
              ? encodeMailToken({
                  version: 1,
                  kind: "cursor",
                  protocol: "imap",
                  folder: input.folder,
                  value: JSON.stringify({ path, uidValidity, nextSequence: start - 1 } satisfies ImapCursor),
                  expiresAt: Date.now() + CURSOR_TTL_MS,
                })
              : null,
        };
      } finally {
        lock.release();
      }
    });
  }

  async getMessage(input: GetMessageInput): Promise<MailMessage> {
    const opaque = decodeMailToken(input.messageId, "message");
    if (opaque.protocol !== "imap" || opaque.folder !== input.folder) {
      throw new ProviderError("MESSAGE_NOT_FOUND", false, "IMAP message reference mismatch");
    }
    const reference = parseJson<ImapReference>(opaque.value);
    if (!reference.path || !/^\d+$/.test(reference.uidValidity) || !Number.isSafeInteger(reference.uid)) {
      throw new ProviderError("MESSAGE_NOT_FOUND", false, "Invalid IMAP message reference");
    }
    const token = await input.resolveToken(input.account.id, "imap_mail");
    return withClient(this.clientFactory, input.account.email, token, async (client) => {
      const lock = await client.getMailboxLock(reference.path, { readOnly: true, acquireTimeout: 10_000 });
      try {
        if (!client.mailbox || client.mailbox.uidValidity.toString() !== reference.uidValidity) {
          throw new ProviderError("MESSAGE_NOT_FOUND", false, "IMAP mailbox version changed");
        }
        const message = await client.fetchOne(
          String(reference.uid),
          { envelope: true, flags: true, internalDate: true, bodyStructure: true },
          { uid: true },
        );
        if (!message) throw new ProviderError("MESSAGE_NOT_FOUND", false, "IMAP message no longer exists");
        return mapMessage(
          message,
          input.folder,
          reference.path,
          client.mailbox.uidValidity,
          await loadBody(client, message),
        );
      } finally {
        lock.release();
      }
    });
  }
}
