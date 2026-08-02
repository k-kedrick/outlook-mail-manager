import { prisma } from "@/shared/database/prisma";
import { encryptValue } from "@/shared/crypto/keyring";
import type { AccountImporter, ImportedAccountInput } from "../domain/import-account";

const MAINTENANCE_MS = 14 * 24 * 60 * 60_000;

export class PrismaAccountImporter implements AccountImporter {
  async import(input: ImportedAccountInput, groupId?: string): Promise<{ accountId: string; created: boolean }> {
    const normalizedEmail = input.email.toLowerCase();
    const existing = await prisma.mailAccount.findUnique({ where: { normalizedEmail }, select: { id: true } });
    const password = input.password ? encryptValue(input.password) : undefined;
    const totp = input.totp ? encryptValue(input.totp) : undefined;
    const refresh = encryptValue(input.refreshToken);
    return prisma.$transaction(async (transaction) => {
      const account = existing
        ? await transaction.mailAccount.update({
            where: { id: existing.id },
            data: {
              email: input.email,
              status: "unknown",
              lastError: null,
              lastErrorCode: null,
              preferredProtocol: null,
              ...(groupId ? { groupId } : {}),
              rowVersion: { increment: 1 },
            },
          })
        : await transaction.mailAccount.create({
            data: {
              email: input.email,
              normalizedEmail,
              status: "unknown",
              ...(groupId ? { groupId } : {}),
            },
          });
      if (password || totp) {
        const keyId = password?.keyId ?? totp?.keyId;
        await transaction.accountSecret.upsert({
          where: { accountId: account.id },
          create: {
            accountId: account.id,
            keyId: keyId as string,
            passwordCipher: password?.ciphertext,
            totpCipher: totp?.ciphertext,
          },
          update: {
            keyId,
            ...(password ? { passwordCipher: password.ciphertext } : {}),
            ...(totp ? { totpCipher: totp.ciphertext } : {}),
          },
        });
      }
      await transaction.oAuthGrant.upsert({
        where: {
          accountId_resource_clientId: {
            accountId: account.id,
            resource: "IMPORTED_MULTI_RESOURCE",
            clientId: input.clientId,
          },
        },
        create: {
          accountId: account.id,
          resource: "IMPORTED_MULTI_RESOURCE",
          source: "IMPORTED",
          clientId: input.clientId,
          refreshTokenCipher: refresh.ciphertext,
          keyId: refresh.keyId,
          grantedScopes: [],
          nextMaintenanceAt: new Date(Date.now() + MAINTENANCE_MS),
        },
        update: {
          status: "ACTIVE",
          refreshTokenCipher: refresh.ciphertext,
          keyId: refresh.keyId,
          version: { increment: 1 },
          lastErrorCode: null,
          nextMaintenanceAt: new Date(Date.now() + MAINTENANCE_MS),
          accessTokens: { deleteMany: {} },
        },
      });
      for (const protocol of ["GRAPH", "IMAP", "OUTLOOK_REST_LEGACY"] as const) {
        await transaction.protocolCapability.upsert({
          where: { accountId_protocol: { accountId: account.id, protocol } },
          create: { accountId: account.id, protocol },
          update: {
            state: "UNKNOWN",
            consecutiveFailures: 0,
            lastErrorCode: null,
            circuitOpenUntil: null,
          },
        });
      }
      return { accountId: account.id, created: !existing };
    });
  }
}
