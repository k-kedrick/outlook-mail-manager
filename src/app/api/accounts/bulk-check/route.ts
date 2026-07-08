import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccounts } from "@/lib/outlook/health";
import { bulkIdsSchema } from "@/lib/validation";

export const runtime = "nodejs";
// Bulk network checks can take a while for large selections.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({}));

    // Empty/omitted ids means "check everything".
    let ids: string[] | null = null;
    if (body && Array.isArray(body.ids) && body.ids.length > 0) {
      ids = bulkIdsSchema.parse(body).ids;
    }

    const accounts = await prisma.mailAccount.findMany({
      where: ids ? { id: { in: ids } } : undefined,
    });

    const results = await checkAccounts(accounts, 5);
    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    return ok({ checked: results.length, summary, results });
  } catch (error) {
    return routeError(error);
  }
}
