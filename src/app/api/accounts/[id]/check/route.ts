import { fail, ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccount } from "@/lib/outlook/health";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    await requireAuth();
    const { id } = await params;
    const account = await prisma.mailAccount.findUnique({ where: { id } });
    if (!account) return fail("账号不存在。", 404);

    const result = await checkAccount(account);
    return ok({ result });
  } catch (error) {
    return routeError(error);
  }
}
