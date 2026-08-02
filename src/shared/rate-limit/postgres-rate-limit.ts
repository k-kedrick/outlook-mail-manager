import { prisma } from "@/shared/database/prisma";
import { hmacValue } from "@/shared/crypto/hash";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export async function consumeRateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
  nowMs = Date.now(),
): Promise<RateLimitResult> {
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + windowMs * 2);
  const keyHash = hmacValue(`${scope}:${subject}`);
  const bucket = await prisma.rateLimitBucket.upsert({
    where: { keyHash_windowStart: { keyHash, windowStart } },
    create: { keyHash, windowStart, expiresAt },
    update: { count: { increment: 1 }, expiresAt },
  });
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + windowMs - nowMs) / 1000));
  return { allowed: bucket.count <= limit, retryAfterSeconds };
}
