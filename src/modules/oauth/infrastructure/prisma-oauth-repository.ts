import type {
  AccessTokenProfile as PrismaAccessTokenProfile,
  OAuthGrantSource as PrismaGrantSource,
  OAuthResource as PrismaOAuthResource,
} from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import type {
  AccessTokenProfile,
  OAuthFlowRecord,
  OAuthGrant,
  OAuthGrantSource,
  OAuthRepository,
  OAuthResource,
  TokenCacheRecord,
} from "../domain/oauth";

const resourceToPrisma: Record<OAuthResource, PrismaOAuthResource> = {
  graph: "GRAPH",
  outlook_imap: "OUTLOOK_IMAP",
  outlook_rest_legacy: "OUTLOOK_REST_LEGACY",
  imported_multi_resource: "IMPORTED_MULTI_RESOURCE",
};
const resourceToDomain = Object.fromEntries(
  Object.entries(resourceToPrisma).map(([domain, prismaValue]) => [prismaValue, domain]),
) as Record<PrismaOAuthResource, OAuthResource>;
const sourceToPrisma: Record<OAuthGrantSource, PrismaGrantSource> = {
  managed: "MANAGED",
  imported: "IMPORTED",
};
const profileToPrisma: Record<AccessTokenProfile, PrismaAccessTokenProfile> = {
  graph_mail: "GRAPH_MAIL",
  imap_mail: "IMAP_MAIL",
  outlook_rest_legacy: "OUTLOOK_REST_LEGACY",
};

function mapGrant(row: {
  id: string;
  accountId: string;
  resource: PrismaOAuthResource;
  source: PrismaGrantSource;
  status: "ACTIVE" | "REAUTH_REQUIRED" | "REVOKED" | "ERROR";
  clientId: string;
  tenantId: string | null;
  refreshTokenCipher: string;
  grantedScopes: string[];
  version: number;
  refreshLeaseOwner: string | null;
  refreshLeaseExpiresAt: Date | null;
}): OAuthGrant {
  return {
    ...row,
    resource: resourceToDomain[row.resource],
    source: row.source.toLowerCase() as OAuthGrantSource,
    status: row.status.toLowerCase() as OAuthGrant["status"],
  };
}

export class PrismaOAuthRepository implements OAuthRepository {
  async createFlow(input: {
    adminId: string;
    accountId?: string;
    resource: OAuthResource;
    stateHash: string;
    nonceHash: string;
    pkceVerifierCipher: string;
    expectedSubject?: string;
    expectedTenantId?: string;
    expiresAt: Date;
  }): Promise<void> {
    await prisma.oAuthFlow.create({
      data: { ...input, resource: resourceToPrisma[input.resource] },
    });
  }

  async consumeFlow(stateHash: string, now: Date): Promise<OAuthFlowRecord | null> {
    return prisma.$transaction(async (transaction) => {
      const flow = await transaction.oAuthFlow.findFirst({
        where: { stateHash, consumedAt: null, expiresAt: { gt: now } },
      });
      if (!flow) return null;
      const consumed = await transaction.oAuthFlow.updateMany({
        where: { id: flow.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) return null;
      return { ...flow, resource: resourceToDomain[flow.resource] };
    });
  }

  async upsertGrant(input: {
    accountId: string;
    resource: OAuthResource;
    source: OAuthGrantSource;
    clientId: string;
    tenantId?: string;
    refreshTokenCipher: string;
    grantedScopes: string[];
    keyId: string;
    lastVerifiedAt: Date;
    nextMaintenanceAt: Date;
    providerExpiresAt?: Date;
  }): Promise<OAuthGrant> {
    const row = await prisma.oAuthGrant.upsert({
      where: {
        accountId_resource_clientId: {
          accountId: input.accountId,
          resource: resourceToPrisma[input.resource],
          clientId: input.clientId,
        },
      },
      create: { ...input, resource: resourceToPrisma[input.resource], source: sourceToPrisma[input.source] },
      update: {
        source: sourceToPrisma[input.source],
        status: "ACTIVE",
        tenantId: input.tenantId,
        refreshTokenCipher: input.refreshTokenCipher,
        grantedScopes: input.grantedScopes,
        keyId: input.keyId,
        lastVerifiedAt: input.lastVerifiedAt,
        nextMaintenanceAt: input.nextMaintenanceAt,
        providerExpiresAt: input.providerExpiresAt,
        lastErrorCode: null,
        version: { increment: 1 },
      },
    });
    return mapGrant(row);
  }

  async findGrant(accountId: string, profile: AccessTokenProfile): Promise<OAuthGrant | null> {
    const preferred =
      profile === "graph_mail"
        ? ["GRAPH", "IMPORTED_MULTI_RESOURCE"]
        : profile === "imap_mail"
          ? ["OUTLOOK_IMAP", "IMPORTED_MULTI_RESOURCE"]
          : ["OUTLOOK_REST_LEGACY", "IMPORTED_MULTI_RESOURCE"];
    const row = await prisma.oAuthGrant.findFirst({
      where: { accountId, status: "ACTIVE", resource: { in: preferred as PrismaOAuthResource[] } },
      orderBy: { source: "asc" },
    });
    return row ? mapGrant(row) : null;
  }

  async saveAccessToken(input: {
    grantId: string;
    profile: AccessTokenProfile;
    tokenCipher: string;
    keyId: string;
    expiresAt: Date;
  }): Promise<void> {
    await prisma.accessTokenCache.upsert({
      where: { grantId_profile: { grantId: input.grantId, profile: profileToPrisma[input.profile] } },
      create: { ...input, profile: profileToPrisma[input.profile] },
      update: { tokenCipher: input.tokenCipher, keyId: input.keyId, expiresAt: input.expiresAt },
    });
  }

  async findCachedToken(grantId: string, profile: AccessTokenProfile): Promise<TokenCacheRecord | null> {
    return prisma.accessTokenCache.findUnique({
      where: { grantId_profile: { grantId, profile: profileToPrisma[profile] } },
      select: { tokenCipher: true, expiresAt: true },
    });
  }

  async claimRefreshLease(grantId: string, owner: string, now: Date, expiresAt: Date): Promise<boolean> {
    const result = await prisma.oAuthGrant.updateMany({
      where: {
        id: grantId,
        status: "ACTIVE",
        OR: [{ refreshLeaseExpiresAt: null }, { refreshLeaseExpiresAt: { lte: now } }],
      },
      data: { refreshLeaseOwner: owner, refreshLeaseExpiresAt: expiresAt },
    });
    return result.count === 1;
  }

  async releaseRefreshLease(grantId: string, owner: string, errorCode?: string): Promise<void> {
    await prisma.oAuthGrant.updateMany({
      where: { id: grantId, refreshLeaseOwner: owner },
      data: { refreshLeaseOwner: null, refreshLeaseExpiresAt: null, lastErrorCode: errorCode },
    });
  }

  async markGrantStatus(grantId: string, status: OAuthGrant["status"], errorCode: string): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      const grant = await transaction.oAuthGrant.update({
        where: { id: grantId },
        data: {
          status: status.toUpperCase() as "ACTIVE" | "REAUTH_REQUIRED" | "REVOKED" | "ERROR",
          lastErrorCode: errorCode,
          refreshLeaseOwner: null,
          refreshLeaseExpiresAt: null,
        },
        select: { accountId: true },
      });
      if (status === "reauth_required") {
        await transaction.mailAccount.update({
          where: { id: grant.accountId },
          data: { status: "reauth_required", lastErrorCode: errorCode, lastError: null },
        });
      }
    });
  }

  async completeRefresh(input: {
    grantId: string;
    owner: string;
    expectedVersion: number;
    refreshTokenCipher?: string;
    refreshTokenKeyId?: string;
    profile: AccessTokenProfile;
    accessTokenCipher: string;
    accessTokenKeyId: string;
    accessTokenExpiresAt: Date;
    providerExpiresAt?: Date;
    nextMaintenanceAt: Date;
    rotatedAt: Date;
  }): Promise<boolean> {
    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.oAuthGrant.updateMany({
        where: {
          id: input.grantId,
          version: input.expectedVersion,
          refreshLeaseOwner: input.owner,
        },
        data: {
          ...(input.refreshTokenCipher
            ? { refreshTokenCipher: input.refreshTokenCipher, keyId: input.refreshTokenKeyId }
            : {}),
          version: { increment: 1 },
          lastRotatedAt: input.rotatedAt,
          lastVerifiedAt: input.rotatedAt,
          providerExpiresAt: input.providerExpiresAt,
          nextMaintenanceAt: input.nextMaintenanceAt,
          refreshLeaseOwner: null,
          refreshLeaseExpiresAt: null,
          lastErrorCode: null,
          status: "ACTIVE",
        },
      });
      if (updated.count !== 1) return false;
      await transaction.accessTokenCache.upsert({
        where: { grantId_profile: { grantId: input.grantId, profile: profileToPrisma[input.profile] } },
        create: {
          grantId: input.grantId,
          profile: profileToPrisma[input.profile],
          tokenCipher: input.accessTokenCipher,
          keyId: input.accessTokenKeyId,
          expiresAt: input.accessTokenExpiresAt,
        },
        update: {
          tokenCipher: input.accessTokenCipher,
          keyId: input.accessTokenKeyId,
          expiresAt: input.accessTokenExpiresAt,
        },
      });
      return true;
    });
  }
}
