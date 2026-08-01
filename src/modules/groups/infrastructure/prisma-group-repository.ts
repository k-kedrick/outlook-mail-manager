import { Prisma } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import type { CreateGroupInput, GroupRepository, UpdateGroupInput } from "../domain/group";

export class PrismaGroupRepository implements GroupRepository {
  list() {
    return prisma.mailGroup.findMany({
      include: { _count: { select: { accounts: true } } },
      orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }],
    });
  }

  create(input: CreateGroupInput) {
    return prisma.mailGroup.create({ data: input });
  }

  async update(id: string, input: UpdateGroupInput) {
    try {
      return await prisma.mailGroup.update({ where: { id }, data: input });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.mailGroup.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
      throw error;
    }
  }
}
