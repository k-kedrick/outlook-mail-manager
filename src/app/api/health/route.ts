import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return ok({ status: "ok", database: "ok" });
  } catch (error) {
    console.error(`[health] database error=${error instanceof Error ? error.name : typeof error}`);
    return ok({ status: "error", database: "unavailable" }, { status: 503 });
  }
}
