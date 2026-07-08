import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bulkIdsSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Remove the card-key binding from the given accounts.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const { ids } = bulkIdsSchema.parse(await request.json());
    const result = await prisma.cardKey.deleteMany({ where: { accountId: { in: ids } } });
    return ok({ unbound: result.count });
  } catch (error) {
    return routeError(error);
  }
}
