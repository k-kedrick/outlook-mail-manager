import { fail, ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchInboxAndJunk } from "@/lib/outlook/mail";
import { statusFromError } from "@/lib/outlook/oauth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    await requireAuth();
    const { id } = await params;
    const searchParams = new URL(request.url).searchParams;
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20") || 20));
    const inboxOffset = Math.min(
      10_000,
      Math.max(0, Number(searchParams.get("inboxOffset") ?? "0") || 0),
    );
    const junkOffset = Math.min(
      10_000,
      Math.max(0, Number(searchParams.get("junkOffset") ?? "0") || 0),
    );

    const account = await prisma.mailAccount.findUnique({ where: { id } });
    if (!account) return fail("账号不存在。", 404);

    try {
      const result = await fetchInboxAndJunk(account, { limit, inboxOffset, junkOffset });
      // Reading succeeded — mark healthy.
      await prisma.mailAccount.update({
        where: { id },
        data: { status: "OK", lastError: null, lastCheckedAt: new Date() },
      });
      return ok(result);
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
