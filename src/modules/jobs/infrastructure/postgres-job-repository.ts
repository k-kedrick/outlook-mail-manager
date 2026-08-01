import { Prisma, type Job, type JobStatus } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { toJsonValue } from "@/shared/database/json";
import type { ClaimedJob, JobRepository, JobType } from "../domain/job";

const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];

type ClaimedRow = {
  id: string;
  type: string;
  accountId: string | null;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
};

export class PostgresJobRepository implements JobRepository {
  async enqueue(input: {
    type: JobType;
    payload: unknown;
    accountId?: string;
    dedupeKey?: string;
    runAt?: Date;
    priority?: number;
    maxAttempts?: number;
  }): Promise<Job> {
    if (input.dedupeKey) {
      const existing = await prisma.job.findUnique({ where: { dedupeKey: input.dedupeKey } });
      if (existing) return existing;
    }
    try {
      return await prisma.job.create({
        data: {
          type: input.type,
          payload: toJsonValue(input.payload),
          accountId: input.accountId,
          dedupeKey: input.dedupeKey,
          runAt: input.runAt,
          priority: input.priority,
          maxAttempts: input.maxAttempts,
        },
      });
    } catch (error) {
      if (input.dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.job.findUnique({ where: { dedupeKey: input.dedupeKey } });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async claim(workerId: string, leaseMs = 60_000): Promise<ClaimedJob | null> {
    return prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<ClaimedRow[]>(Prisma.sql`
        WITH candidate AS (
          SELECT id
          FROM "Job"
          WHERE status IN ('PENDING'::"JobStatus", 'RETRY'::"JobStatus")
            AND "runAt" <= NOW()
            AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= NOW())
            AND (
              "accountId" IS NULL OR NOT EXISTS (
                SELECT 1 FROM "Job" running
                WHERE running.status = 'RUNNING'::"JobStatus"
                  AND running."accountId" = "Job"."accountId"
                  AND running."leaseExpiresAt" > NOW()
              )
            )
          ORDER BY priority DESC, "runAt" ASC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "Job" AS job
        SET status = 'RUNNING'::"JobStatus",
            attempts = job.attempts + 1,
            "leaseOwner" = ${workerId},
            "leaseExpiresAt" = NOW() + (${leaseMs} * INTERVAL '1 millisecond'),
            "updatedAt" = NOW()
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING job.id, job.type, job."accountId", job.payload, job.attempts,
                  job."maxAttempts", job."leaseOwner", job."leaseExpiresAt"
      `);
      const row = rows[0];
      if (!row) return null;
      await transaction.jobAttempt.create({
        data: { jobId: row.id, attempt: row.attempts, workerId, outcome: "RUNNING" },
      });
      return {
        id: row.id,
        type: row.type as JobType,
        accountId: row.accountId,
        payload: row.payload,
        attempt: row.attempts,
        maxAttempts: row.maxAttempts,
        leaseOwner: row.leaseOwner,
        leaseExpiresAt: row.leaseExpiresAt,
      };
    });
  }

  async renewLease(jobId: string, workerId: string, leaseMs = 60_000): Promise<boolean> {
    const updated = await prisma.job.updateMany({
      where: { id: jobId, status: "RUNNING", leaseOwner: workerId },
      data: { leaseExpiresAt: new Date(Date.now() + leaseMs) },
    });
    return updated.count === 1;
  }

  async succeed(job: ClaimedJob, result: unknown): Promise<void> {
    await this.finish(job, "SUCCEEDED", { result: toJsonValue(result), completedAt: new Date(), dedupeKey: null });
  }

  async fail(job: ClaimedJob, errorCode: string, retryable: boolean, retryAfterMs?: number): Promise<JobStatus> {
    const shouldRetry = retryable && job.attempt < job.maxAttempts;
    const status: JobStatus = shouldRetry ? "RETRY" : "FAILED";
    const delay = retryAfterMs ?? RETRY_DELAYS_MS[Math.min(job.attempt - 1, RETRY_DELAYS_MS.length - 1)];
    await this.finish(job, status, {
      lastErrorCode: errorCode,
      runAt: shouldRetry ? new Date(Date.now() + delay) : undefined,
      completedAt: shouldRetry ? null : new Date(),
      ...(shouldRetry ? {} : { dedupeKey: null }),
    });
    return status;
  }

  find(id: string): Promise<Job | null> {
    return prisma.job.findUnique({ where: { id } });
  }

  async heartbeat(workerId: string, version: string, concurrency: number): Promise<void> {
    await prisma.workerHeartbeat.upsert({
      where: { workerId },
      create: { workerId, version, concurrency },
      update: { version, concurrency, lastSeenAt: new Date() },
    });
  }

  async cleanup(now = new Date()): Promise<void> {
    const attemptsBefore = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    const auditBefore = new Date(now.getTime() - 90 * 24 * 60 * 60_000);
    await prisma.$transaction([
      prisma.jobAttempt.deleteMany({ where: { startedAt: { lt: attemptsBefore } } }),
      prisma.job.deleteMany({
        where: { completedAt: { lt: attemptsBefore }, status: { in: ["SUCCEEDED", "FAILED", "CANCELLED"] } },
      }),
      prisma.auditEvent.deleteMany({ where: { createdAt: { lt: auditBefore } } }),
      prisma.adminSession.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.oAuthFlow.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.codeRequest.deleteMany({ where: { expiresAt: { lt: attemptsBefore } } }),
      prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
  }

  private async finish(job: ClaimedJob, status: JobStatus, data: Prisma.JobUpdateManyMutationInput): Promise<void> {
    const completedAt = new Date();
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.job.updateMany({
        where: { id: job.id, status: "RUNNING", leaseOwner: job.leaseOwner },
        data: { ...data, status, leaseOwner: null, leaseExpiresAt: null },
      });
      if (updated.count !== 1) throw new Error("JOB_LEASE_LOST");
      await transaction.jobAttempt.update({
        where: { jobId_attempt: { jobId: job.id, attempt: job.attempt } },
        data: {
          outcome: status,
          completedAt,
          durationMs: Math.max(0, completedAt.getTime() - (job.leaseExpiresAt.getTime() - 60_000)),
          errorCode: typeof data.lastErrorCode === "string" ? data.lastErrorCode : null,
        },
      });
    });
  }
}
