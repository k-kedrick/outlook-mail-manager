import { describe, expect, it, vi } from "vitest";
import { AccountNotFoundError } from "../domain/account-admin";
import { AccountAdminService } from "./account-admin-service";

describe("AccountAdminService", () => {
  it("delegates list/export and returns existing account mutations", async () => {
    const repository = {
      list: vi.fn(async () => ({ accounts: [], nextCursor: null })),
      update: vi.fn(async () => ({ id: "account-1", email: "one@example.com" })),
      delete: vi.fn(async () => ({ id: "account-1", email: "one@example.com" })),
      export: vi.fn(async () => ({ count: 1, text: "one@example.com----" })),
      reveal: vi.fn(async () => ({ email: "one@example.com", password: null, totpSecret: null, grants: [] })),
    } as any;
    const service = new AccountAdminService(repository);
    await expect(service.list({ limit: 50 })).resolves.toEqual({ accounts: [], nextCursor: null });
    await expect(service.update("account-1", { preferredProtocol: "graph" })).resolves.toMatchObject({ id: "account-1" });
    await expect(service.delete("account-1")).resolves.toMatchObject({ id: "account-1" });
    await expect(service.export(["account-1"])).resolves.toMatchObject({ count: 1 });
    await expect(service.reveal("account-1")).resolves.toMatchObject({ email: "one@example.com" });
  });

  it("uses one stable not-found error for update, deletion and reveal", async () => {
    const repository = {
      update: vi.fn(async () => null),
      delete: vi.fn(async () => null),
      reveal: vi.fn(async () => null),
    } as any;
    const service = new AccountAdminService(repository);
    await expect(service.update("missing", {})).rejects.toBeInstanceOf(AccountNotFoundError);
    await expect(service.delete("missing")).rejects.toBeInstanceOf(AccountNotFoundError);
    await expect(service.reveal("missing")).rejects.toBeInstanceOf(AccountNotFoundError);
  });
});
