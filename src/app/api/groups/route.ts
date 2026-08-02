import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeGroup } from "@/lib/serialize";
import { groupCreateSchema } from "@/lib/validation";

export async function GET(): Promise<Response> {
  try {
    await requireAuth();
    const groups = await prisma.mailGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { accounts: true } } },
    });
    return ok({ groups: groups.map(serializeGroup) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const input = groupCreateSchema.parse(await request.json());
    const group = await prisma.mailGroup.create({
      data: { name: input.name, color: input.color ?? null },
      include: { _count: { select: { accounts: true } } },
    });
    return ok({ group: serializeGroup(group) });
  } catch (error) {
    return routeError(error);
  }
}
