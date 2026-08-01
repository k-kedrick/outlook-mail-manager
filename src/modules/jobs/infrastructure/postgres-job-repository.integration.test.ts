import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/database/prisma";
import { JOB_TYPES } from "../domain/job";
import { PostgresJobRepository } from "./postgres-job-repository";

const integration = describe.runIf(process.env.DATABASE_URL?.startsWith("postgresql://") ?? false);

integration("PostgreSQL job leases", () => {
  const ids: string[] = [];
  const accountIds: string[] = [];

  afterEach(async () => {
    if (ids.length) await prisma.job.deleteMany({ where: { id: { in: ids.splice(0) } } });
    if (accountIds.length) await prisma.mailAccount.deleteMany({ where: { id: { in: accountIds.splice(0) } } });
  });

  it("allows only one worker to claim a queued row", async () => {
    const repository = new PostgresJobRepository();
    const job = await repository.enqueue({
      type: JOB_TYPES.RETENTION_CLEANUP,
      payload: {},
      dedupeKey: `integration:${crypto.randomUUID()}`,
    });
    ids.push(job.id);
    const claims = await Promise.all([repository.claim("worker-a"), repository.claim("worker-b")]);
    expect(claims.filter((claim) => claim?.id === job.id)).toHaveLength(1);
  });

  it("does not run two jobs for the same account at the same time", async () => {
    const repository = new PostgresJobRepository();
    const account = await prisma.mailAccount.create({ data: { email: `${crypto.randomUUID()}@example.com`, normalizedEmail: `${crypto.randomUUID()}@example.com` } });
    accountIds.push(account.id);
    for (const suffix of ["a", "b"]) {
      const queued = await repository.enqueue({ type: JOB_TYPES.ACCOUNT_HEALTH, accountId: account.id, payload: {}, dedupeKey: `account-lock:${suffix}:${crypto.randomUUID()}` });
      ids.push(queued.id);
    }
    const first = await repository.claim("worker-a");
    const second = await repository.claim("worker-b");
    expect(first?.accountId).toBe(account.id);
    expect(second).toBeNull();
  });
});
