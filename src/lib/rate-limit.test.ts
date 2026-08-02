import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, clearRateLimitsForTests, requestIp } from "./rate-limit";

beforeEach(clearRateLimitsForTests);

describe("rate limiter", () => {
  it("blocks after the configured allowance and returns a retry delay", () => {
    expect(checkRateLimit("login", "ip", 2, 60_000, 1_000).allowed).toBe(true);
    expect(checkRateLimit("login", "ip", 2, 60_000, 1_000).allowed).toBe(true);
    const blocked = checkRateLimit("login", "ip", 2, 60_000, 1_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(60);
  });

  it("uses only the Nginx-overwritten real IP header", () => {
    const request = new Request("http://localhost", {
      headers: { "x-real-ip": "203.0.113.5", "cf-connecting-ip": "198.51.100.9" },
    });
    expect(requestIp(request)).toBe("203.0.113.5");
  });
});
