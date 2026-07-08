import { randomInt } from "node:crypto";

// Card-key suffix alphabet: uppercase letters + digits, minus the visually
// ambiguous ones (0/O, 1/I) so codes stay easy to read aloud / retype.
const SUFFIX_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SUFFIX_LENGTH = 8;

/** 8-char random suffix (e.g. "9F3KD7Q2"). */
export function randomSuffix(): string {
  let out = "";
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    out += SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)];
  }
  return out;
}

/** Build a full card key: "<prefix>-<suffix>", or just the suffix when no prefix. */
export function buildCode(prefix: string): string {
  const p = prefix.trim();
  return p ? `${p}-${randomSuffix()}` : randomSuffix();
}
