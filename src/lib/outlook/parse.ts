import { isValidBase32Secret } from "@/lib/totp";

export type ParsedFull = {
  kind: "full";
  email: string;
  password: string;
  clientId: string;
  refreshToken: string;
  totp: string | null;
};

export type ParsedTotpOnly = {
  kind: "totpOnly";
  email: string;
  totp: string;
};

export type ParsedAccount = ParsedFull | ParsedTotpOnly;

export type ParseResult = {
  ok: ParsedAccount[];
  invalid: { line: number; raw: string; reason: string }[];
  duplicateInInput: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// UUID-ish; we accept anything that looks like a GUID but don't hard-require dashes.
const CLIENT_ID_RE = /^[0-9a-fA-F-]{16,64}$/;

/**
 * Parse pasted bulk text. Each non-empty line is one of three `----` formats:
 *   email----password----clientId----refreshToken                (4 segs, create/update)
 *   email----password----clientId----refreshToken----2faSecret   (5 segs, + authenticator)
 *   email----2faSecret                                           (2 segs, patch 2FA only)
 * Extra trailing segments beyond a full record are ignored.
 */
export function parseAccounts(text: string): ParseResult {
  const ok: ParsedAccount[] = [];
  const invalid: ParseResult["invalid"] = [];
  const seen = new Set<string>();
  let duplicateInInput = 0;

  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const parts = line.split("----").map((p) => p.trim());

    // 2-segment form: email----2faSecret (patch the authenticator on an existing account).
    if (parts.length === 2) {
      const [email, totp] = parts;
      if (!EMAIL_RE.test(email)) {
        invalid.push({ line: index + 1, raw: rawLine, reason: `邮箱格式无效：${email}` });
        return;
      }
      if (!isValidBase32Secret(totp)) {
        invalid.push({ line: index + 1, raw: rawLine, reason: "身份验证器密钥格式无效（应为 base32）" });
        return;
      }
      if (dedupe(seen, email)) {
        duplicateInInput += 1;
        return;
      }
      ok.push({ kind: "totpOnly", email: email.toLowerCase(), totp });
      return;
    }

    if (parts.length < 4) {
      invalid.push({ line: index + 1, raw: rawLine, reason: "字段不足（需 4 段，或 email----2FA密钥 补充身份验证器）" });
      return;
    }

    const [email, password, clientId, refreshToken] = parts;
    const totpRaw = parts.length >= 5 ? parts[4] : "";

    if (!EMAIL_RE.test(email)) {
      invalid.push({ line: index + 1, raw: rawLine, reason: `邮箱格式无效：${email}` });
      return;
    }
    if (!password) {
      invalid.push({ line: index + 1, raw: rawLine, reason: "密码为空" });
      return;
    }
    if (!CLIENT_ID_RE.test(clientId)) {
      invalid.push({ line: index + 1, raw: rawLine, reason: `ClientId 格式可疑：${clientId}` });
      return;
    }
    if (!refreshToken || refreshToken.length < 10) {
      invalid.push({ line: index + 1, raw: rawLine, reason: "RefreshToken 为空或过短" });
      return;
    }
    if (totpRaw && !isValidBase32Secret(totpRaw)) {
      invalid.push({ line: index + 1, raw: rawLine, reason: "身份验证器密钥格式无效（应为 base32）" });
      return;
    }

    if (dedupe(seen, email)) {
      duplicateInInput += 1;
      return;
    }
    ok.push({
      kind: "full",
      email: email.toLowerCase(),
      password,
      clientId,
      refreshToken,
      totp: totpRaw || null,
    });
  });

  return { ok, invalid, duplicateInInput };
}

/** Returns true if this email was already seen (a duplicate in the input). */
function dedupe(seen: Set<string>, email: string): boolean {
  const key = email.toLowerCase();
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}
