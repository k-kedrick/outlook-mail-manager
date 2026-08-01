import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/shared/config/env";

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

export function hmacValue(value: string, key = env().CARD_KEY_HMAC_KEY): string {
  return createHmac("sha256", key).update(value, "utf8").digest("base64url");
}

export function sessionTokenHash(value: string): string {
  return hmacValue(value, env().SESSION_SIGNING_KEY);
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
