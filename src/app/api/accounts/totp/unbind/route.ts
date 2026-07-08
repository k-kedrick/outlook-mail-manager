import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bulkIdsSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Remove authenticator (TOTP) secrets from the given accounts.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const { ids } = bulkIdsSchema.parse(await request.json());
    const result = await prisma.mailAccount.updateMany({
      where: { id: { in: ids }, totpSecretCipher: { not: null } },
      data: { totpSecretCipher: null },
    });
    return ok({ removed: result.count });
  } catch (error) {
    return routeError(error);
  }
}
