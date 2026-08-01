import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let releaseStatusCheck: (() => void) | undefined;
const { verifyStatuses } = vi.hoisted(() => ({ verifyStatuses: vi.fn() }));

vi.mock("@/lib/settings", () => ({
  getConfig: vi.fn(async () => ({
    refreshEnabled: false,
    statusCheckEnabled: true,
    statusCheckIntervalMinutes: 5,
    lastStatusCheckAt: null,
    codePollEnabled: false,
  })),
  markStatusCheckRan: vi.fn(async () => undefined),
  markCodePollRan: vi.fn(async () => undefined),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { mailAccount: { findMany: vi.fn(async () => [{ id: "account" }]) } },
}));
vi.mock("./health", () => ({ verifyStatuses, checkAccounts: vi.fn() }));
vi.mock("./code-service", () => ({ fetchAndStoreCodes: vi.fn() }));
vi.mock("./keep-alive", () => ({ runKeepAlive: vi.fn() }));

import { startKeepAliveScheduler } from "./scheduler";

describe("scheduler re-entry protection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    verifyStatuses.mockImplementation(
      () => new Promise((resolve) => {
        releaseStatusCheck = () => resolve([]);
      }),
    );
  });

  afterEach(() => {
    releaseStatusCheck?.();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("does not start a second status check while the first tick is running", async () => {
    startKeepAliveScheduler();
    await vi.advanceTimersByTimeAsync(11_000);
    expect(verifyStatuses).toHaveBeenCalledTimes(1);
    releaseStatusCheck?.();
    await Promise.resolve();
  });
});
