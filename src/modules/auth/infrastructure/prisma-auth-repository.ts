import type { Prisma } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import type {
  AdminAuthRepository,
  AdminIdentity,
  AdminSessionIdentity,
} from "../domain/admin-auth";

const adminSelect = {
  id: true,
  username: true,
  passwordHash: true,
  totpSecretCipher: true,
  totpConfirmedAt: true,
  bootstrapComplete: true,
  sessionVersion: true,
} satisfies Prisma.AdminUserSelect;

export class PrismaAdminAuthRepository implements AdminAuthRepository {
  findAdmin(username: string): Promise<AdminIdentity | null> {
    return prisma.adminUser.findUnique({ where: { username }, select: adminSelect });
  }

  findAdminById(id: string): Promise<AdminIdentity | null> {
    return prisma.adminUser.findUnique({ where: { id }, select: adminSelect });
  }

  upsertBootstrapAdmin(input: {
    username: string;
    passwordHash: string;
    totpSecretCipher: string;
  }): Promise<AdminIdentity> {
    return prisma.adminUser.upsert({
      where: { username: input.username },
      create: input,
      update: {
        passwordHash: input.passwordHash,
        totpSecretCipher: input.totpSecretCipher,
        totpConfirmedAt: null,
        bootstrapComplete: false,
        sessionVersion: { increment: 1 },
        recoveryCodes: { deleteMany: {} },
        sessions: { deleteMany: {} },
      },
      select: adminSelect,
    });
  }

  async completeBootstrap(adminId: string, recoveryCodeHashes: string[]): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      await transaction.recoveryCode.deleteMany({ where: { adminId } });
      await transaction.recoveryCode.createMany({
        data: recoveryCodeHashes.map((codeHash) => ({ adminId, codeHash })),
      });
      await transaction.adminUser.update({
        where: { id: adminId },
        data: { bootstrapComplete: true, totpConfirmedAt: new Date() },
      });
    });
  }

  async createSession(input: {
    adminId: string;
    tokenHash: string;
    csrfHash: string;
    expiresAt: Date;
    ipHash?: string;
    userAgentHash?: string;
  }): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      const admin = await transaction.adminUser.findUniqueOrThrow({
        where: { id: input.adminId },
        select: { sessionVersion: true },
      });
      await transaction.adminSession.create({ data: { ...input, sessionVersion: admin.sessionVersion } });
    });
  }

  async findSession(tokenHash: string): Promise<AdminSessionIdentity | null> {
    const session = await prisma.adminSession.findUnique({
      where: { tokenHash },
      include: { admin: { select: { username: true, sessionVersion: true } } },
    });
    if (!session || session.sessionVersion !== session.admin.sessionVersion) return null;
    return {
      id: session.id,
      adminId: session.adminId,
      username: session.admin.username,
      csrfHash: session.csrfHash,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      sessionVersion: session.admin.sessionVersion,
    };
  }

  async touchSession(id: string, at: Date): Promise<void> {
    await prisma.adminSession.update({ where: { id }, data: { lastSeenAt: at } });
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await prisma.adminSession.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllSessions(adminId: string): Promise<void> {
    await prisma.$transaction([
      prisma.adminSession.updateMany({ where: { adminId, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.adminUser.update({ where: { id: adminId }, data: { sessionVersion: { increment: 1 } } }),
    ]);
  }

  async changePasswordAndRevokeSessions(adminId: string, passwordHash: string): Promise<void> {
    await prisma.$transaction([
      prisma.adminUser.update({
        where: { id: adminId },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      }),
      prisma.adminSession.updateMany({
        where: { adminId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async consumeRecoveryCode(adminId: string, codeHash: string): Promise<boolean> {
    const result = await prisma.recoveryCode.updateMany({
      where: { adminId, codeHash, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }
}
