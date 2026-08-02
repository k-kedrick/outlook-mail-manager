import { Prisma, type MailProtocol as PrismaMailProtocol } from "@prisma/client";
import { decryptValue } from "@/shared/crypto/keyring";
import { prisma } from "@/shared/database/prisma";
import type {
  AccountAdminListInput,
  AccountAdminPatch,
  AccountAdminRepository,
  RevealedAccount,
} from "../domain/account-admin";

const protocolToPrisma = {
  graph: "GRAPH",
  imap: "IMAP",
  outlook_rest_legacy: "OUTLOOK_REST_LEGACY",
} satisfies Record<NonNullable<AccountAdminPatch["preferredProtocol"]>, PrismaMailProtocol>;

export class PrismaAccountAdminRepository implements AccountAdminRepository {
  async list(input: AccountAdminListInput) {
    const rows = await prisma.mailAccount.findMany({
      where: input.query
        ? { normalizedEmail: { contains: input.query.toLowerCase(), mode: "insensitive" } }
        : undefined,
      include: {
        capabilities: true,
        oauthGrants: {
          select: {
            id: true,
            resource: true,
            source: true,
            status: true,
            lastRotatedAt: true,
            lastVerifiedAt: true,
            nextMaintenanceAt: true,
            providerExpiresAt: true,
            lastErrorCode: true,
          },
        },
        cardKey: { select: { codePrefix: true, codeLast4: true } },
        group: { select: { id: true, name: true, color: true } },
        secret: { select: { passwordCipher: true, totpCipher: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: input.limit + 1,
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      accounts: page.map((account) => ({
        id: account.id,
        email: account.email,
        accountType: account.accountType.toLowerCase(),
        status: account.status,
        preferredProtocol: account.preferredProtocol?.toLowerCase() as "graph" | "imap" | "outlook_rest_legacy" | null,
        lastCheckedAt: account.lastCheckedAt,
        lastErrorCode: account.lastErrorCode,
        group: account.group,
        hasPassword: Boolean(account.secret?.passwordCipher),
        hasTotp: Boolean(account.secret?.totpCipher),
        cardKey: account.cardKey ? { prefix: account.cardKey.codePrefix, last4: account.cardKey.codeLast4 } : null,
        capabilities: account.capabilities.map((capability) => ({
          protocol: capability.protocol.toLowerCase(),
          state: capability.state.toLowerCase(),
          consecutiveFailures: capability.consecutiveFailures,
          lastSuccessAt: capability.lastSuccessAt,
          circuitOpenUntil: capability.circuitOpenUntil,
          lastErrorCode: capability.lastErrorCode,
        })),
        grants: account.oauthGrants.map((grant) => ({
          ...grant,
          resource: grant.resource.toLowerCase(),
          source: grant.source.toLowerCase(),
          status: grant.status.toLowerCase(),
        })),
        createdAt: account.createdAt,
      })),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }

  async update(id: string, input: AccountAdminPatch) {
    try {
      return await prisma.mailAccount.update({
        where: { id },
        data: {
          ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
          ...(input.preferredProtocol !== undefined
            ? { preferredProtocol: input.preferredProtocol ? protocolToPrisma[input.preferredProtocol] : null }
            : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          rowVersion: { increment: 1 },
        },
        select: { id: true, email: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      throw error;
    }
  }

  async delete(id: string) {
    try {
      return await prisma.mailAccount.delete({ where: { id }, select: { id: true, email: true } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      throw error;
    }
  }

  async export(accountIds: string[]): Promise<{ count: number; text: string }> {
    const accounts = await prisma.mailAccount.findMany({
      where: { id: { in: accountIds } },
      include: { secret: true, oauthGrants: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    const lines = accounts.map((account) => {
      const grant = account.oauthGrants.find((item) => item.resource === "IMPORTED_MULTI_RESOURCE") ?? account.oauthGrants[0];
      return [
        account.email,
        account.secret?.passwordCipher ? decryptValue(account.secret.passwordCipher) : "",
        grant?.clientId ?? "",
        grant ? decryptValue(grant.refreshTokenCipher) : "",
        account.secret?.totpCipher ? decryptValue(account.secret.totpCipher) : "",
      ].join("----");
    });
    return { count: accounts.length, text: lines.join("\n") };
  }

  async reveal(id: string): Promise<RevealedAccount | null> {
    const account = await prisma.mailAccount.findUnique({
      where: { id },
      include: { secret: true, oauthGrants: { where: { status: "ACTIVE" } } },
    });
    if (!account) return null;
    return {
      email: account.email,
      password: account.secret?.passwordCipher ? decryptValue(account.secret.passwordCipher) : null,
      totpSecret: account.secret?.totpCipher ? decryptValue(account.secret.totpCipher) : null,
      grants: account.oauthGrants.map((grant) => ({
        resource: grant.resource.toLowerCase(),
        source: grant.source.toLowerCase(),
        clientId: grant.clientId,
        refreshToken: decryptValue(grant.refreshTokenCipher),
      })),
    };
  }
}
