import { beforeAll, describe, expect, it, vi } from "vitest";
import { resetEnvironmentForTests } from "@/shared/config/env";
import { CardKeyCollisionError } from "../domain/redemption";
import { CardKeyService } from "./card-key-service";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3005";
  process.env.SESSION_SIGNING_KEY = "unit-session-signing-key-1234567890123456";
  process.env.DATA_ENCRYPTION_KEYS = "unit:unit-data-encryption-key-1234567890123456";
  process.env.CARD_KEY_HMAC_KEY = "unit-card-hmac-key-12345678901234567890";
  process.env.ADMIN_BOOTSTRAP_PASSWORD = "unit-bootstrap-password";
  resetEnvironmentForTests();
});

describe("CardKeyService", () => {
  it("isolates missing, existing and persistence failures while returning new plaintext once", async () => {
    const repository = {
      findAccounts: vi.fn(async () => [
        { id: "new", email: "new@example.com", hasCardKey: false },
        { id: "existing", email: "existing@example.com", hasCardKey: true },
        { id: "failed", email: "failed@example.com", hasCardKey: false },
      ]),
      save: vi.fn(async ({ accountId }: { accountId: string }) => {
        if (accountId === "failed") throw new Error("database unavailable");
      }),
      findByHash: vi.fn(),
    };
    const result = await new CardKeyService(repository).generate({
      accountIds: ["new", "existing", "failed", "missing"],
      prefix: " team 01! ",
    });

    expect(result.generated).toHaveLength(1);
    expect(result.generated[0]).toMatchObject({ accountId: "new" });
    expect(result.generated[0]?.code).toMatch(/^TEAM01-[A-Z2-9]{12}$/);
    expect(result.skipped).toEqual(["existing"]);
    expect(result.missing).toEqual(["missing"]);
    expect(result.failed).toEqual([{ accountId: "failed", email: "failed@example.com", reasonCode: "PERSISTENCE_ERROR" }]);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      accountId: "new",
      codePrefix: "TEAM01",
      codeHash: expect.any(String),
      codeLast4: expect.stringMatching(/^[A-Z2-9]{4}$/),
    }));
  });

  it("retries a HMAC collision and resolves normalized codes only by hash", async () => {
    const resolved = { id: "key", accountId: "account", account: { email: "one@example.com", secret: null } };
    const repository = {
      findAccounts: vi.fn(async () => [{ id: "account", email: "one@example.com", hasCardKey: false }]),
      save: vi.fn()
        .mockRejectedValueOnce(new CardKeyCollisionError())
        .mockResolvedValueOnce(undefined),
      findByHash: vi.fn(async () => resolved),
    };
    const service = new CardKeyService(repository);
    await expect(service.generate({ accountIds: ["account"], regenerate: true })).resolves.toMatchObject({ generated: [{ accountId: "account" }] });
    expect(repository.save).toHaveBeenCalledTimes(2);
    await expect(service.resolve("  abcd-2345  ")).resolves.toBe(resolved);
    expect(repository.findByHash).toHaveBeenCalledWith(expect.any(String));
    expect(repository.findByHash).not.toHaveBeenCalledWith("ABCD-2345");
  });
});
