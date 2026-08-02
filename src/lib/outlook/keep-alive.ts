import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkAccounts, type CheckResult } from "./health";

export type KeepAliveOptions = {
  /** Only renew accounts whose last renewal is older than this (or never renewed). */
  staleBeforeHours?: number;
  /** Same as staleBeforeHours but expressed in days (takes precedence if set). */
  staleBeforeDays?: number;
  /** Restrict to specific account ids. */
  ids?: string[];
  concurrency?: number;
};

export type KeepAliveSummary = {
  checked: number;
  refreshed: number;
  skipped: number;
  failed: number;
  summary: Record<string, number>;
  results: CheckResult[];
};

/**
 * Proactively refresh (rotate) refresh tokens so their inactivity window keeps
 * sliding forward. Forcing a token exchange rotates the refresh token and stamps
 * refreshTokenUpdatedAt (see getAccessToken). Shared by the API route, the
 * in-process scheduler, and the standalone CLI script.
 */
export async function runKeepAlive({
  staleBeforeHours,
  staleBeforeDays,
  ids,
  concurrency = 5,
}: KeepAliveOptions = {}): Promise<KeepAliveSummary> {
  const where: Prisma.MailAccountWhereInput = {};

  const hours =
    typeof staleBeforeDays === "number" ? staleBeforeDays * 24 : staleBeforeHours;

  if (ids && ids.length > 0) {
    where.id = { in: ids };
  } else if (typeof hours === "number") {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    where.OR = [{ refreshTokenUpdatedAt: null }, { refreshTokenUpdatedAt: { lt: cutoff } }];
  }

  const accounts = await prisma.mailAccount.findMany({ where });
  const results = await checkAccounts(accounts, concurrency);
  const summary = results.reduce<Record<string, number>>((acc, r) => {
    const key = r.refreshOutcome ?? "FAILED";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    checked: results.length,
    refreshed: summary.REFRESHED ?? 0,
    skipped: summary.SKIPPED ?? 0,
    failed: summary.FAILED ?? 0,
    summary,
    results,
  };
}
