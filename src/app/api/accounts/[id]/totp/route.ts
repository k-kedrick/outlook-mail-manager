import { fail, ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { totpWithRemaining } from "@/lib/totp";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Current authenticator (TOTP) code for an account. Pure local compute — no network.
export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    await requireAuth();
    const { id } = await params;
    const account = await prisma.mailAccount.findUnique({
      where: { id },
      select: { totpSecretCipher: true },
    });
    if (!account) return fail("账号不存在。", 404);
    if (!account.totpSecretCipher) return ok({ totp: null });

    const secret = decryptSecret(account.totpSecretCipher);
    const { code: totp, secondsRemaining, period } = totpWithRemaining(secret);
    return ok({ totp, secondsRemaining, period });
  } catch (error) {
    return routeError(error);
  }
}
