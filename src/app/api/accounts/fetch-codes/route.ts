import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchAndStoreCodes } from "@/lib/outlook/code-service";
import { bulkIdsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

// Bulk-fetch latest verification codes. With ids → those; without → all OK accounts.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({}));

    let ids: string[] | undefined;
    if (body && Array.isArray(body.ids) && body.ids.length > 0) {
      ids = bulkIdsSchema.parse(body).ids;
    }

    const accounts = await prisma.mailAccount.findMany({
      where: ids ? { id: { in: ids } } : { status: "OK" },
    });

    const results = await fetchAndStoreCodes(accounts, 5);
    const withCode = results.filter((r) => r.code).length;
    return ok({ fetched: results.length, withCode, results });
  } catch (error) {
    return routeError(error);
  }
}
