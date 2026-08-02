import { describe, expect, it, vi } from "vitest";
import { ImportAccountsService } from "./import-accounts-service";

const clientId = "5e5f0f01-1111-4111-8111-111111111111";
const token = "refresh-token-value-with-enough-length";

describe("ImportAccountsService", () => {
  it("isolates row failures and preserves successful imports", async () => {
    const importer = { import: vi.fn().mockResolvedValueOnce({ accountId: "a", created: true }).mockRejectedValueOnce(new Error("db")) };
    const result = await new ImportAccountsService(importer).execute([
      `a@example.com----${clientId}----${token}`,
      `b@example.com----${clientId}----${token}`,
    ].join("\n"));
    expect(result).toMatchObject({ requested: 2, created: 1, updated: 0 });
    expect(result.accounts).toEqual([{ id: "a", email: "a@example.com" }]);
    expect(result.failed).toEqual([{ line: 2, email: "b@example.com", reason: "IMPORT_FAILED" }]);
  });
});
