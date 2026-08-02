import { describe, expect, it } from "vitest";
import { parseImportedAccounts } from "./import-account";

const clientId = "5e5f0f01-1111-4111-8111-111111111111";
const token = "refresh-token-value-with-enough-length";

describe("V2 account import parser", () => {
  it("accepts three and five fields, normalizes duplicates and isolates bad lines", () => {
    const result = parseImportedAccounts([
      `First@Example.com----${clientId}----${token}`,
      `first@example.com----${clientId}----${token}`,
      `second@example.com----password----${clientId}----${token}----JBSWY3DPEHPK3PXP`,
      "broken-line",
    ].join("\n"));
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts[1]).toMatchObject({ email: "second@example.com", password: "password", totp: "JBSWY3DPEHPK3PXP" });
    expect(result.duplicates).toBe(1);
    expect(result.invalid).toEqual([{ line: 4, reason: "INVALID_SEGMENT_COUNT" }]);
  });
});
