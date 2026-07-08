import { fail, ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchAndStoreCode } from "@/lib/outlook/code-service";
import { statusFromError } from "@/lib/outlook/oauth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// Fetch the latest verification code (INBOX + Junk), cache it on the account.
export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    await requireAuth();
    const { id } = await params;
    const account = await prisma.mailAccount.findUnique({ where: { id } });
    if (!account) return fail("账号不存在。", 404);

    try {
      const result = await fetchAndStoreCode(account);
      await prisma.mailAccount.update({
        where: { id },
        data: { status: "OK", lastError: null, lastCheckedAt: new Date() },
      });
      return ok({ result });
    } catch (mailError) {
      const status = statusFromError(mailError);
      const message = mailError instanceof Error ? mailError.message : String(mailError);
      await prisma.mailAccount.update({
        where: { id },
        data: { status, lastError: message, lastCheckedAt: new Date() },
      });
      return fail(message, 502);
    }
  } catch (error) {
    return routeError(error);
  }
}
