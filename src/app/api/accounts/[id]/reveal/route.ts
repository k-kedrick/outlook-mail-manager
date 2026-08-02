import { fail, ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";

type Ctx = { params: Promise<{ id: string }> };

// Returns decrypted credentials on explicit request (for the "reveal / copy" UI).
// List endpoints never include these.
export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    await requireAuth();
    const { id } = await params;
    const account = await prisma.mailAccount.findUnique({ where: { id } });
    if (!account) return fail("账号不存在。", 404);

    return ok({
      email: account.email,
      password: decryptSecret(account.passwordCipher),
      clientId: account.clientId,
      refreshToken: decryptSecret(account.refreshTokenCipher),
    });
  } catch (error) {
    return routeError(error);
  }
}
