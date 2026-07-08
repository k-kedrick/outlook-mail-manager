import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bulkIdsSchema } from "@/lib/validation";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const { ids } = bulkIdsSchema.parse(await request.json());
    const result = await prisma.mailAccount.deleteMany({ where: { id: { in: ids } } });
    return ok({ deleted: result.count });
  } catch (error) {
    return routeError(error);
  }
}
