import type { MailMessage } from "@/modules/mail/domain/mail-provider";

export interface CodeWatchExecutor {
  execute(codeRequestId: string): Promise<{ found: boolean }>;
}

const PATTERNS = [
  /(?:\u9a8c\u8bc1\u7801|\u6821\u9a8c\u7801|\u52a8\u6001\u7801|\u5b89\u5168\u4ee3\u7801)[^0-9A-Za-z]{0,12}([0-9]{4,8})/i,
  /(?:verification code|security code|one-?time code|temporary code|passcode|otp|pin)\s*(?:is|:|=)?\s*([A-Z0-9]{4,8})\b/i,
];

function text(message: MailMessage): string {
  return [message.subject, message.preview, message.bodyText ?? "", message.bodyHtml?.replace(/<[^>]+>/g, " ") ?? ""]
    .join("\n")
    .replace(/\s+/g, " ");
}

export function extractVerificationCode(message: MailMessage): string | null {
  const value = text(message);
  for (const pattern of PATTERNS) {
    const code = pattern.exec(value)?.[1];
    if (code) return code;
  }
  return null;
}
