import type { AccessTokenProfile } from "@/modules/oauth/domain/oauth";
import { prisma } from "@/shared/database/prisma";
import type { JobRepository } from "../domain/job";
import { JOB_TYPES } from "../domain/job";

export async function enqueueScheduledJobs(jobs: JobRepository): Promise<void> {
  const now = new Date();
  const healthThreshold = new Date(now.getTime() - 6 * 60 * 60_000);
  const capabilityThreshold = new Date(now.getTime() - 24 * 60 * 60_000);
  const [healthAccounts, capabilityAccounts, grants] = await Promise.all([
    prisma.mailAccount.findMany({
      where: { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lte: healthThreshold } }] },
      select: { id: true },
      take: 500,
    }),
    prisma.mailAccount.findMany({
      where: {
        OR: [
          { capabilities: { none: {} } },
          { capabilities: { some: { lastProbedAt: { lte: capabilityThreshold } } } },
        ],
      },
      select: { id: true },
      take: 500,
    }),
    prisma.oAuthGrant.findMany({
      where: { status: "ACTIVE", nextMaintenanceAt: { lte: now } },
      select: { id: true, accountId: true, resource: true },
      take: 500,
    }),
  ]);
  for (const account of healthAccounts) {
    await jobs.enqueue({
      type: JOB_TYPES.ACCOUNT_HEALTH,
      accountId: account.id,
      payload: {},
      dedupeKey: `health:${account.id}`,
      runAt: new Date(now.getTime() + Math.floor(Math.random() * 5 * 60_000)),
    });
  }
  for (const account of capabilityAccounts) {
    await jobs.enqueue({
      type: JOB_TYPES.CAPABILITY_PROBE,
      accountId: account.id,
      payload: {},
      dedupeKey: `capability:${account.id}`,
      runAt: new Date(now.getTime() + Math.floor(Math.random() * 15 * 60_000)),
    });
  }
  for (const grant of grants) {
    const profile: AccessTokenProfile = grant.resource === "GRAPH"
      ? "graph_mail"
      : grant.resource === "OUTLOOK_REST_LEGACY"
        ? "outlook_rest_legacy"
        : "imap_mail";
    await jobs.enqueue({
      type: JOB_TYPES.TOKEN_MAINTENANCE,
      accountId: grant.accountId,
      payload: { profile },
      dedupeKey: `token:${grant.id}`,
    });
  }
  const nextCleanupAt = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  ));
  await jobs.enqueue({
    type: JOB_TYPES.RETENTION_CLEANUP,
    payload: {},
    dedupeKey: `retention:${nextCleanupAt.toISOString().slice(0, 10)}`,
    runAt: nextCleanupAt,
    priority: -10,
    maxAttempts: 3,
  });
}
