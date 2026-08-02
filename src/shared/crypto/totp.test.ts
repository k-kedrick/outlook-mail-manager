import { describe, expect, it } from "vitest";
import { totpCode, verifyTotp } from "./totp";

describe("TOTP", () => {
  it("matches RFC 6238 SHA-1 vectors", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(totpCode(secret, 59_000, 30, 8)).toBe("94287082");
  });

  it("accepts only the configured time window", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now + 90_000), now)).toBe(false);
  });
});
