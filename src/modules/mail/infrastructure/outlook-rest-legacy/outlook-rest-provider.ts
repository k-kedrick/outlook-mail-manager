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

const BASE_URL = "https://outlook.office.com/api/v2.0";
const CURSOR_TTL_MS = 15 * 60_000;

type LegacyMessage = {
  Id: string;
  Subject?: string;
  BodyPreview?: string;
  IsRead?: boolean;
  ReceivedDateTime?: string;
  From?: { EmailAddress?: { Name?: string; Address?: string } };
  Body?: { ContentType?: string; Content?: string };
};

async function legacyRequest<T>(url: string, token: string, email: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-AnchorMailbox": email,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ProviderError("NETWORK_ERROR", true, "Legacy Outlook network error");
  }
  if (!response.ok) {
    if (response.status === 401) throw new ProviderError("AUTH_REQUIRED", false, "Legacy Outlook token rejected");
    if (response.status === 403) throw new ProviderError("PERMISSION_DENIED", false, "Legacy Outlook permission denied");
    if (response.status === 404) throw new ProviderError("MESSAGE_NOT_FOUND", false, "Legacy Outlook item not found");
    if (response.status === 429) {
      const retryAfter = Math.max(1, Number(response.headers.get("retry-after") ?? "60")) * 1000;
      throw new ProviderError("RATE_LIMITED", true, "Legacy Outlook rate limited", retryAfter);
    }
    throw new ProviderError("PROVIDER_UNAVAILABLE", response.status >= 500, `Legacy Outlook HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function mapMessage(message: LegacyMessage, folder: "inbox" | "junk", withBody: boolean): MailMessage {
  const isHtml = message.Body?.ContentType?.toLowerCase() === "html";
  return {
    id: encodeMailToken({
      version: 1,
      kind: "message",
      protocol: "outlook_rest_legacy",
      folder,
      value: message.Id,
    }),
    protocol: "outlook_rest_legacy",
    folder,
    from: message.From?.EmailAddress?.Address ?? "",
    fromName: message.From?.EmailAddress?.Name ?? null,
    subject: message.Subject || "(无主题)",
    receivedAt: message.ReceivedDateTime ?? null,
    preview: message.BodyPreview ?? "",
    isRead: Boolean(message.IsRead),
    bodyText: withBody && !isHtml ? message.Body?.Content ?? null : null,
    bodyHtml: withBody && isHtml ? message.Body?.Content ?? null : null,
  };
}

export class OutlookRestLegacyProvider implements MailProvider {
  readonly protocol = "outlook_rest_legacy" as const;

  async probe(input: ProbeInput): Promise<ProbeResult> {
    const startedAt = Date.now();
    const token = await input.resolveToken(input.account.id, "outlook_rest_legacy");
    await legacyRequest(`${BASE_URL}/me/MailFolders/Inbox?$select=Id,DisplayName`, token, input.account.email);
    return { available: true, latencyMs: Date.now() - startedAt };
  }

  async listMessages(input: ListMessagesInput): Promise<MailPage> {
    const token = await input.resolveToken(input.account.id, "outlook_rest_legacy");
    let offset = 0;
    if (input.cursor) {
      const cursor = decodeMailToken(input.cursor, "cursor");
      if (cursor.protocol !== this.protocol || cursor.folder !== input.folder || !/^\d+$/.test(cursor.value)) {
        throw new ProviderError("INVALID_CURSOR", false, "Legacy cursor mismatch");
      }
      offset = Number(cursor.value);
    }
    const limit = Math.min(100, Math.max(1, input.limit));
    const folder = input.folder === "junk" ? "JunkEmail" : "Inbox";
    const params = new URLSearchParams({
      $top: String(limit),
      $skip: String(offset),
      $orderby: "ReceivedDateTime desc",
      $select: "Id,Subject,From,ReceivedDateTime,BodyPreview,IsRead",
    });
    const page = await legacyRequest<{ value?: LegacyMessage[] }>(
      `${BASE_URL}/me/MailFolders/${folder}/messages?${params}`,
      token,
      input.account.email,
    );
    const messages = page.value ?? [];
    return {
      messages: messages.map((message) => mapMessage(message, input.folder, false)),
      nextCursor:
        messages.length === limit
          ? encodeMailToken({
              version: 1,
              kind: "cursor",
              protocol: this.protocol,
              folder: input.folder,
              value: String(offset + messages.length),
              expiresAt: Date.now() + CURSOR_TTL_MS,
            })
          : null,
    };
  }

  async getMessage(input: GetMessageInput): Promise<MailMessage> {
    const reference = decodeMailToken(input.messageId, "message");
    if (reference.protocol !== this.protocol || reference.folder !== input.folder) {
      throw new ProviderError("MESSAGE_NOT_FOUND", false, "Legacy message reference mismatch");
    }
    const token = await input.resolveToken(input.account.id, "outlook_rest_legacy");
    const params = new URLSearchParams({
      $select: "Id,Subject,From,ReceivedDateTime,BodyPreview,IsRead,Body",
    });
    const message = await legacyRequest<LegacyMessage>(
      `${BASE_URL}/me/messages/${encodeURIComponent(reference.value)}?${params}`,
      token,
      input.account.email,
    );
    return mapMessage(message, input.folder, true);
  }
}
