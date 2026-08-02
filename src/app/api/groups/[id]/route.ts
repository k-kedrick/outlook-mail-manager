import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeGroup } from "@/lib/serialize";
import { groupPatchSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  try {
    await requireAuth();
    const { id } = await params;
    const input = groupPatchSchema.parse(await request.json());
    const group = await prisma.mailGroup.update({
      where: { id },
      data: input,
      include: { _count: { select: { accounts: true } } },
    });
    return ok({ group: serializeGroup(group) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    await requireAuth();
    const { id } = await params;
    // Accounts keep existing; their groupId is set null via onDelete: SetNull.
    await prisma.mailGroup.delete({ where: { id } });
    return ok({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
