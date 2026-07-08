import type { MailMessage } from "./mail";

export type CodeCandidate = {
  code: string;
  score: number;
  context: string;
};

const KEYWORDS = [
  "验证码",
  "校验码",
  "动态码",
  "verification",
  "verify",
  "security code",
  "one-time",
  "one time",
  "passcode",
  "otp",
  "code",
  "pin",
];

// Ordered by specificity — labelled patterns score higher than a bare number.
const LABELLED_PATTERNS: RegExp[] = [
  /(?:验证码|校验码|动态码|安全代码)[^0-9A-Za-z]{0,12}([0-9]{4,8})/gi,
  /(?:verification code|security code|one-?time code|temporary verification code|passcode|otp|code|pin)(?:\s+(?:is|to|continue|use|enter|this|your|the|temporary|verification|code)){0,8}\s*(?:is|:|：|=)?\s*([0-9]{4,8})/gi,
  /(?:verification code|security code|one-?time code|passcode|otp|code|pin)\s*(?:is|:|：|=)?\s*([A-Z0-9]{4,8})/g,
];

const BARE_NUMBER = /\b([0-9]{4,8})\b/g;

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function messageText(message: MailMessage): string {
  const parts = [message.subject, message.preview, message.bodyText ?? ""];
  if (message.bodyHtml) parts.push(stripHtml(message.bodyHtml));
  return parts.filter(Boolean).join("\n");
}

function contextAround(text: string, code: string): string {
  const idx = text.indexOf(code);
  if (idx < 0) return code;
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + code.length + 40);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

/** Extract the most likely verification code from a single message. */
export function extractCode(message: MailMessage): CodeCandidate | null {
  const text = messageText(message);
  if (!text) return null;

  const hasKeyword = KEYWORDS.some((k) => text.toLowerCase().includes(k.toLowerCase()));
  const candidates = new Map<string, number>();

  for (const pattern of LABELLED_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const code = match[1];
      if (code) candidates.set(code, Math.max(candidates.get(code) ?? 0, 100 - code.length));
    }
  }

  if (candidates.size === 0 && hasKeyword) {
    for (const match of text.matchAll(BARE_NUMBER)) {
      const code = match[1];
      // Prefer 6-digit codes; penalise year-like/short numbers.
      const base = code.length === 6 ? 60 : code.length === 4 ? 40 : 30;
      candidates.set(code, Math.max(candidates.get(code) ?? 0, base));
    }
  }

  if (candidates.size === 0) return null;

  let best: CodeCandidate | null = null;
  for (const [code, score] of candidates) {
    if (!best || score > best.score) {
      best = { code, score, context: contextAround(text, code) };
    }
  }
  return best;
}

/** Scan recent messages and return the newest one that contains a code. */
export function findLatestCode(
  messages: MailMessage[],
): { message: MailMessage; candidate: CodeCandidate } | null {
  for (const message of messages) {
    const candidate = extractCode(message);
    if (candidate) return { message, candidate };
  }
  return null;
}
