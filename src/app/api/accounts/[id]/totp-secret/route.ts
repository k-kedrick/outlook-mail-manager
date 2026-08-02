import { fail, ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/secrets";
import { totpSecretSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Set or replace one account's authenticator (TOTP) secret.
export async function PUT(request: Request, { params }: Ctx): Promise<Response> {
  try {
    await requireAuth();
    const { id } = await params;
    const { secret } = totpSecretSchema.parse(await request.json());

    const account = await prisma.mailAccount.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!account) return fail("账号不存在。", 404);

    await prisma.mailAccount.update({
      where: { id },
      data: { totpSecretCipher: encryptSecret(secret) },
    });

    return ok({ has2fa: true });
  } catch (error) {
    return routeError(error);
  }
}
