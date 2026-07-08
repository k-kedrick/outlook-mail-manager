import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyStatuses } from "@/lib/outlook/health";
import { bulkIdsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

// Read-only status probe (reuses cached tokens, does NOT rotate refresh tokens).
// With ids → those; without → all non-dead accounts.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({}));

    let ids: string[] | undefined;
    if (body && Array.isArray(body.ids) && body.ids.length > 0) {
      ids = bulkIdsSchema.parse(body).ids;
    }

    const accounts = await prisma.mailAccount.findMany({
      where: ids ? { id: { in: ids } } : { status: { not: "AUTH_FAILED" } },
    });

    const results = await verifyStatuses(accounts, 5);
    const summary = results.reduce<Record<string, number>>((acc, r) => {
      const key = r.skipped ? "SKIPPED" : r.status;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return ok({ checked: results.length, summary, results });
  } catch (error) {
    return routeError(error);
  }
}
