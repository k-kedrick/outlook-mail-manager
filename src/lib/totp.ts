import { createHmac } from "node:crypto";

// TOTP (RFC 6238) over HMAC-SHA1 — the scheme Google/Microsoft Authenticator use.
// Secrets are base32 (RFC 4648) seeds; codes roll every `period` seconds.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decode an RFC 4648 base32 string (spaces/padding tolerated) into bytes. */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/\s+/g, "").replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`非法 base32 字符：${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

/** True when the string looks like a usable base32 TOTP secret. */
export function isValidBase32Secret(input: string): boolean {
  const clean = input.replace(/\s+/g, "").replace(/=+$/, "").toUpperCase();
  return clean.length >= 16 && /^[A-Z2-7]+$/.test(clean);
}

export type TotpOptions = {
  period?: number;
  digits?: number;
  timestamp?: number; // ms since epoch
};

/** Compute the current TOTP code for a base32 secret. */
export function generateTotp(secret: string, options: TotpOptions = {}): string {
  const { period = 30, digits = 6, timestamp = Date.now() } = options;
  const key = base32Decode(secret);

  let counter = Math.floor(timestamp / 1000 / period);
  const counterBuf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i -= 1) {
    counterBuf[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }

  const hmac = createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export type TotpNow = { code: string; secondsRemaining: number; period: number };

/** Current code plus seconds until it rolls over — for a live countdown UI. */
export function totpWithRemaining(secret: string, options: TotpOptions = {}): TotpNow {
  const period = options.period ?? 30;
  const timestamp = options.timestamp ?? Date.now();
  const code = generateTotp(secret, { ...options, period, timestamp });
  const secondsRemaining = period - Math.floor((timestamp / 1000) % period);
  return { code, secondsRemaining, period };
}
