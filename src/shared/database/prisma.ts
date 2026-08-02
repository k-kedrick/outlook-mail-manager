import { PrismaClient } from "@prisma/client";
import { logger } from "@/shared/logging/logger";

function createPrismaClient() {
  const client = new PrismaClient({
    log: [
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });
  client.$on("error", (event) => logger({ component: "database" }).error({ target: event.target }, "prisma error"));
  client.$on("warn", (event) => logger({ component: "database" }).warn({ target: event.target }, "prisma warning"));
  return client;
}

type PrismaInstance = ReturnType<typeof createPrismaClient>;
const globalPrisma = globalThis as typeof globalThis & { outlookPrisma?: PrismaInstance };

export const prisma = globalPrisma.outlookPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalPrisma.outlookPrisma = prisma;
