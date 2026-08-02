import { createHmac } from "node:crypto";
import { appSecret } from "@/lib/server-env";

type Entry = { count: number; resetAt: number };
const entries = new Map<string, Entry>();
let operations = 0;

export type RateLimitResult = { allowed: boolean; retryAfter: number; remaining: number };

export function requestIp(request: Request): string {
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function privateKey(value: string): string {
  return createHmac("sha256", appSecret()).update(value).digest("base64url");
}

export function checkRateLimit(bucket: string, key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  operations += 1;
  if (operations % 500 === 0) {
    for (const [entryKey, entry] of entries) if (entry.resetAt <= now) entries.delete(entryKey);
  }
  const mapKey = `${bucket}:${key}`;
  const current = entries.get(mapKey);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  entry.count += 1;
  entries.set(mapKey, entry);
  return {
    allowed: entry.count <= limit,
    retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    remaining: Math.max(0, limit - entry.count),
  };
}

export function clearRateLimitsForTests(): void {
  entries.clear();
  operations = 0;
}
