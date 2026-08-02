import { describe, expect, it, vi } from "vitest";
import { OAuthDomainError } from "@/modules/oauth/domain/oauth";
import { JOB_TYPES, type ClaimedJob } from "../domain/job";
import { JobHandlers } from "./job-handlers";

function job(type: ClaimedJob["type"], accountId: string | null = "account-1", payload: unknown = {}): ClaimedJob {
  return { id: "job", type, accountId, payload, attempt: 1, maxAttempts: 5, leaseOwner: "worker", leaseExpiresAt: new Date(Date.now() + 60_000) };
}

describe("JobHandlers", () => {
  it("delegates capability and code-watch jobs to their use-case ports", async () => {
    const mail = {
      health: vi.fn(async () => ({ protocol: "graph", available: true })),
      probe: vi.fn(async () => [{ protocol: "graph", available: true }]),
    } as any;
    const code = { execute: vi.fn(async () => ({ found: true })) };
    const handlers = new JobHandlers({ cleanup: vi.fn() } as any, mail, {} as any, code);
    await expect(handlers.execute(job(JOB_TYPES.ACCOUNT_HEALTH))).resolves.toMatchObject({ health: { protocol: "graph" } });
    await expect(handlers.execute(job(JOB_TYPES.CAPABILITY_PROBE))).resolves.toMatchObject({ capabilities: [{ available: true }] });
    await expect(handlers.execute(job(JOB_TYPES.CODE_WATCH, "account-1", { codeRequestId: "request" }))).resolves.toEqual({ found: true });
  });

  it("maps OAuth retry semantics into a durable job error", async () => {
    const tokens = { getAccessToken: vi.fn(async () => { throw new OAuthDomainError("RATE_LIMITED", true, "limited", 30_000); }) };
    const handlers = new JobHandlers({ cleanup: vi.fn() } as any, {} as any, tokens, {} as any);
    await expect(handlers.execute(job(JOB_TYPES.TOKEN_MAINTENANCE))).rejects.toMatchObject({ code: "RATE_LIMITED", retryable: true, retryAfterMs: 30_000 });
  });
});
