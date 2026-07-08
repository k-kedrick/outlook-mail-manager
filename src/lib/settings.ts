import type { AppConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SINGLETON_ID = "singleton";

export type ConfigInput = {
  refreshEnabled?: boolean;
  refreshIntervalDays?: number;
  statusCheckEnabled?: boolean;
  statusCheckIntervalMinutes?: number;
  codePollEnabled?: boolean;
  codePollIntervalSeconds?: number;
};

/** Read the single AppConfig row, seeding it from env defaults on first access. */
export async function getConfig(): Promise<AppConfig> {
  const existing = await prisma.appConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;

  const envHours = Number(process.env.KEEP_ALIVE_INTERVAL_HOURS ?? "168");
  const refreshIntervalDays =
    Number.isFinite(envHours) && envHours > 0 ? Math.max(1, Math.round(envHours / 24)) : 7;
  const refreshEnabled = process.env.KEEP_ALIVE_ENABLED !== "0";

  return prisma.appConfig.create({
    data: { id: SINGLETON_ID, refreshEnabled, refreshIntervalDays },
  });
}

export async function updateConfig(data: ConfigInput): Promise<AppConfig> {
  return prisma.appConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });
}

export async function setAdminPasswordHash(hash: string | null): Promise<void> {
  await prisma.appConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, adminPasswordHash: hash },
    update: { adminPasswordHash: hash },
  });
}

export async function markCodePollRan(): Promise<void> {
  await prisma.appConfig
    .update({ where: { id: SINGLETON_ID }, data: { lastCodePollAt: new Date() } })
    .catch(() => {});
}

export async function markStatusCheckRan(): Promise<void> {
  await prisma.appConfig
    .update({ where: { id: SINGLETON_ID }, data: { lastStatusCheckAt: new Date() } })
    .catch(() => {});
}
