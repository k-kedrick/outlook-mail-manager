import { describe, expect, it, vi } from "vitest";

const { findMany, checkAccounts } = vi.hoisted(() => ({
  findMany: vi.fn(),
  checkAccounts: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { mailAccount: { findMany } } }));
vi.mock("./health", () => ({ checkAccounts }));

import { runKeepAlive } from "./keep-alive";

describe("keep-alive summary", () => {
  it("reports real refreshes, skipped attempts and failures separately", async () => {
    findMany.mockResolvedValueOnce([{ id: "1" }, { id: "2" }, { id: "3" }]);
    checkAccounts.mockResolvedValueOnce([
      { refreshOutcome: "REFRESHED" },
      { refreshOutcome: "SKIPPED" },
      { refreshOutcome: "FAILED" },
    ]);
    const result = await runKeepAlive({ staleBeforeDays: 14 });
    expect(result).toMatchObject({
      checked: 3,
      refreshed: 1,
      skipped: 1,
      failed: 1,
      summary: { REFRESHED: 1, SKIPPED: 1, FAILED: 1 },
    });
  });
});
