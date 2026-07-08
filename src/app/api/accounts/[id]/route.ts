import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeAccount } from "@/lib/serialize";
import { accountPatchSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  try {
    await requireAuth();
    const { id } = await params;
    const input = accountPatchSchema.parse(await request.json());

    const data: Record<string, unknown> = {};
    if (input.note !== undefined) data.note = input.note;
    if (input.status !== undefined) data.status = input.status;
    if (input.groupId !== undefined) data.groupId = input.groupId; // null clears group

    const account = await prisma.mailAccount.update({
      where: { id },
      data,
      include: { group: true },
    });
    return ok({ account: serializeAccount(account) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    await requireAuth();
    const { id } = await params;
    await prisma.mailAccount.delete({ where: { id } }).catch(() => {
      throw new Error("账号不存在或已删除。");
    });
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
