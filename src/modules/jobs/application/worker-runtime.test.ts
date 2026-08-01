import { beforeAll, describe, expect, it, vi } from "vitest";
import { resetEnvironmentForTests } from "@/shared/config/env";
import { JobExecutionError } from "../domain/job-error";
import { JOB_TYPES, type ClaimedJob } from "../domain/job";
import { WorkerRuntime } from "./worker-runtime";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3005";
  process.env.SESSION_SIGNING_KEY = "unit-session-signing-key-1234567890123456";
  process.env.DATA_ENCRYPTION_KEYS = "unit:unit-data-encryption-key-1234567890123456";
  process.env.CARD_KEY_HMAC_KEY = "unit-card-hmac-key-12345678901234567890";
  process.env.ADMIN_BOOTSTRAP_PASSWORD = "unit-bootstrap-password";
  process.env.WORKER_ID = "worker-test";
  resetEnvironmentForTests();
});

function job(): ClaimedJob {
  return {
    id: "job-1",
    type: JOB_TYPES.CAPABILITY_PROBE,
    accountId: "account-1",
    payload: {},
    attempt: 1,
    maxAttempts: 5,
    leaseOwner: "worker-test",
    leaseExpiresAt: new Date(Date.now() + 60_000),
  };
}

describe("WorkerRuntime", () => {
  it("heartbeats, schedules and drains an accepted job before stopping", async () => {
    const claimed = job();
    const repository = {
      heartbeat: vi.fn(async () => undefined),
      claim: vi.fn()
        .mockResolvedValueOnce(claimed)
        .mockImplementationOnce(async () => { runtime.stop(); return null; }),
      renewLease: vi.fn(async () => true),
      succeed: vi.fn(async () => undefined),
      fail: vi.fn(),
    } as any;
    const handlers = { execute: vi.fn(async () => ({ available: true })) } as any;
    const schedule = vi.fn(async () => undefined);
    const runtime = new WorkerRuntime(repository, handlers, schedule);

    await runtime.run();
    expect(repository.heartbeat).toHaveBeenCalledWith("worker-test", "2.0.0", 10);
    expect(schedule).toHaveBeenCalledOnce();
    expect(repository.succeed).toHaveBeenCalledWith(claimed, { available: true });
  });

  it("maps known and unexpected failures to durable retry outcomes", async () => {
    const repository = {
      renewLease: vi.fn(async () => true),
      succeed: vi.fn(),
      fail: vi.fn(async () => "RETRY"),
    } as any;
    const knownHandlers = { execute: vi.fn(async () => { throw new JobExecutionError("RATE_LIMITED", true, "wait", 5_000); }) } as any;
    const known = new WorkerRuntime(repository, knownHandlers, vi.fn());
    await (known as any).execute(job());
    expect(repository.fail).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "job-1", leaseOwner: "worker-test" }),
      "RATE_LIMITED",
      true,
      5_000,
    );

    const unknownHandlers = { execute: vi.fn(async () => { throw new Error("contains sensitive provider response"); }) } as any;
    const unknown = new WorkerRuntime(repository, unknownHandlers, vi.fn());
    await (unknown as any).execute(job());
    expect(repository.fail).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "job-1", leaseOwner: "worker-test" }),
      "UNEXPECTED_JOB_ERROR",
      true,
      undefined,
    );
  });
});
