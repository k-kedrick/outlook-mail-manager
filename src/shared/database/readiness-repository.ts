import { prisma } from "./prisma";

export type ReadinessState = { database: true; worker: boolean };

export async function readReadinessState(now = new Date()): Promise<ReadinessState> {
  await prisma.$queryRaw`SELECT 1`;
  const heartbeat = await prisma.workerHeartbeat.findFirst({
    orderBy: { lastSeenAt: "desc" },
    select: { lastSeenAt: true },
  });
  return {
    database: true,
    worker: Boolean(heartbeat && heartbeat.lastSeenAt.getTime() >= now.getTime() - 45_000),
  };
}
