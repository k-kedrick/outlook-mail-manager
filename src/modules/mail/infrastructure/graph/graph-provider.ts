import type {
  GetMessageInput,
  ListMessagesInput,
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

const BASE_URL = "https://graph.microsoft.com/v1.0";
const CURSOR_TTL_MS = 15 * 60_000;

type GraphMessage = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  isRead?: boolean;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
};

function folderName(folder: "inbox" | "junk"): string {
  return folder === "junk" ? "junkemail" : "inbox";
}

async function graphRequestUnbounded<T>(url: string, accessToken: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ProviderError("NETWORK_ERROR", true, "Microsoft Graph network error");
  }
  if (!response.ok) {
    if (response.status === 401) throw new ProviderError("AUTH_REQUIRED", false, "Graph token rejected");
    if (response.status === 403) throw new ProviderError("PERMISSION_DENIED", false, "Graph permission denied");
    if (response.status === 404) throw new ProviderError("MESSAGE_NOT_FOUND", false, "Graph item not found");
    if (response.status === 429) {
      const retryAfter = Math.max(1, Number(response.headers.get("retry-after") ?? "60")) * 1000;
      throw new ProviderError("RATE_LIMITED", true, "Graph rate limited", retryAfter);
    }
    throw new ProviderError("PROVIDER_UNAVAILABLE", response.status >= 500, `Graph HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

let graphSemaphore: Semaphore | undefined;
function graphRequest<T>(url: string, accessToken: string): Promise<T> {
  graphSemaphore ??= new Semaphore(env().GRAPH_CONCURRENCY);
  return graphSemaphore.run(() => graphRequestUnbounded<T>(url, accessToken));
}

function mapMessage(message: GraphMessage, folder: "inbox" | "junk", withBody: boolean): MailMessage {
  const isHtml = message.body?.contentType?.toLowerCase() === "html";
  return {
    id: encodeMailToken({
      version: 1,
      kind: "message",
      protocol: "graph",
      folder,
      value: message.id,
    }),
    protocol: "graph",
    folder,
    from: message.from?.emailAddress?.address ?? "",
    fromName: message.from?.emailAddress?.name ?? null,
    subject: message.subject || "(无主题)",
    receivedAt: message.receivedDateTime ?? null,
    preview: message.bodyPreview ?? "",
    isRead: Boolean(message.isRead),
    bodyText: withBody && !isHtml ? message.body?.content ?? null : null,
    bodyHtml: withBody && isHtml ? message.body?.content ?? null : null,
  };
}

export class GraphMailProvider implements MailProvider {
  readonly protocol = "graph" as const;

  async probe(input: ProbeInput): Promise<ProbeResult> {
    const startedAt = Date.now();
    const token = await input.resolveToken(input.account.id, "graph_mail");
    await graphRequest(`${BASE_URL}/me/mailFolders/inbox?$select=id,totalItemCount`, token);
    return { available: true, latencyMs: Date.now() - startedAt };
  }

  async listMessages(input: ListMessagesInput): Promise<MailPage> {
    const token = await input.resolveToken(input.account.id, "graph_mail");
    let url: string;
    if (input.cursor) {
      const cursor = decodeMailToken(input.cursor, "cursor");
      if (cursor.protocol !== "graph" || cursor.folder !== input.folder || !cursor.value.startsWith(`${BASE_URL}/`)) {
        throw new ProviderError("INVALID_CURSOR", false, "Graph cursor mismatch");
      }
      url = cursor.value;
    } else {
      const params = new URLSearchParams({
        $top: String(Math.min(100, Math.max(1, input.limit))),
        $orderby: "receivedDateTime desc",
        $select: "id,subject,from,receivedDateTime,bodyPreview,isRead",
      });
      url = `${BASE_URL}/me/mailFolders/${folderName(input.folder)}/messages?${params}`;
    }
    const page = await graphRequest<{ value?: GraphMessage[]; "@odata.nextLink"?: string }>(url, token);
    const nextLink = page["@odata.nextLink"];
    return {
      messages: (page.value ?? []).map((message) => mapMessage(message, input.folder, false)),
      nextCursor: nextLink
        ? encodeMailToken({
            version: 1,
            kind: "cursor",
            protocol: "graph",
            folder: input.folder,
            value: nextLink,
            expiresAt: Date.now() + CURSOR_TTL_MS,
          })
        : null,
    };
  }

  async getMessage(input: GetMessageInput): Promise<MailMessage> {
    const reference = decodeMailToken(input.messageId, "message");
    if (reference.protocol !== "graph" || reference.folder !== input.folder) {
      throw new ProviderError("MESSAGE_NOT_FOUND", false, "Graph message reference mismatch");
    }
    const token = await input.resolveToken(input.account.id, "graph_mail");
    const params = new URLSearchParams({
      $select: "id,subject,from,receivedDateTime,bodyPreview,isRead,body",
    });
    const message = await graphRequest<GraphMessage>(
      `${BASE_URL}/me/messages/${encodeURIComponent(reference.value)}?${params}`,
      token,
    );
    return mapMessage(message, input.folder, true);
  }
}
