import { GroupService } from "./application/group-service";
import { PrismaGroupRepository } from "./infrastructure/prisma-group-repository";

export const groupService = new GroupService(new PrismaGroupRepository());
