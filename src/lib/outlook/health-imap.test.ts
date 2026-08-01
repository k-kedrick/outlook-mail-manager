import { describe, expect, it, vi } from "vitest";

const { update, probeImap, getAccessToken } = vi.hoisted(() => ({
  update: vi.fn(async () => ({})),
  probeImap: vi.fn(async () => undefined),
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { mailAccount: { update } } }));
vi.mock("./imap", () => ({ probeImap }));
vi.mock("./oauth", async (importOriginal) => {
  const original = await importOriginal<typeof import("./oauth")>();
  return { ...original, getAccessToken };
});

import { verifyStatus } from "./health";

describe("IMAP status probe", () => {
  it("uses a read-only IMAP probe for an account learned as IMAP", async () => {
    const account = { id: "a", email: "a@example.com", mailProtocol: "imap" } as never;
    const result = await verifyStatus(account);
    expect(result.status).toBe("OK");
    expect(probeImap).toHaveBeenCalledWith(account);
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "a" },
      data: expect.objectContaining({ status: "OK", lastError: null }),
    }));
  });
});
