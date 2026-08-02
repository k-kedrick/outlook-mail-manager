import type { Prisma } from "@prisma/client";
import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WARN_DAYS } from "@/lib/outlook/risk";
import { serializeAccount } from "@/lib/serialize";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const group = url.searchParams.get("group")?.trim() ?? "";
    const status = url.searchParams.get("status")?.trim() ?? "";
    const risk = url.searchParams.get("risk")?.trim() ?? "";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(1000, Math.max(1, Number(url.searchParams.get("pageSize") ?? "50") || 50));

    const where: Prisma.MailAccountWhereInput = {};
    if (status) where.status = status;
    if (group === "none") where.groupId = null;
    else if (group) where.groupId = group;

    // Combine the search-OR and the risk-OR under AND so they don't overwrite
    // each other (both need the top-level `OR` slot otherwise).
    const and: Prisma.MailAccountWhereInput[] = [];
    if (q) {
      // Search matches email or the bound card key (mixed search).
      and.push({
        OR: [
          { email: { contains: q.toLowerCase() } },
          { cardKey: { code: { contains: q.toUpperCase() } } },
        ],
      });
    }
    if (risk === "stale") {
      // Accounts due for renewal: unknown expiry, or expiring within the warn window.
      const threshold = new Date(Date.now() + WARN_DAYS * 24 * 60 * 60 * 1000);
      and.push({ OR: [{ refreshTokenExpiresAt: null }, { refreshTokenExpiresAt: { lt: threshold } }] });
    }
    if (and.length) where.AND = and;

    const [total, accounts, statusGroups] = await Promise.all([
      prisma.mailAccount.count({ where }),
      prisma.mailAccount.findMany({
        where,
        include: { group: true, cardKey: true },
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.mailAccount.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const row of statusGroups) statusCounts[row.status] = row._count._all;

    return ok({
      accounts: accounts.map(serializeAccount),
      total,
      page,
      pageSize,
      statusCounts,
    });
  } catch (error) {
    return routeError(error);
  }
}
