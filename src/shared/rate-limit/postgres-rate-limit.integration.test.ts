import { afterAll, describe, expect, it } from "vitest";
import { hmacValue } from "@/shared/crypto/hash";
import { prisma } from "@/shared/database/prisma";
import { consumeRateLimit } from "./postgres-rate-limit";

const subject = `integration-${crypto.randomUUID()}`;
const scope = "rate-limit-test";
const keyHash = hmacValue(`${scope}:${subject}`);

afterAll(async () => {
  await prisma.rateLimitBucket.deleteMany({ where: { keyHash } });
  await prisma.$disconnect();
});

describe("PostgreSQL rate-limit bucket", () => {
  it("atomically allows the limit and rejects the next request with Retry-After", async () => {
    const now = Date.now();
    await expect(consumeRateLimit(scope, subject, 2, 60_000, now)).resolves.toMatchObject({ allowed: true });
    await expect(consumeRateLimit(scope, subject, 2, 60_000, now + 1)).resolves.toMatchObject({ allowed: true });
    const blocked = await consumeRateLimit(scope, subject, 2, 60_000, now + 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
