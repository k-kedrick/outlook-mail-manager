import type { CapabilityState as PrismaCapabilityState, MailProtocol as PrismaMailProtocol } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import type {
  CapabilityRepository,
  CapabilityState,
  ProtocolCapability,
} from "../domain/capability";
import type { MailProtocol } from "../domain/mail-provider";
import type { ProviderError } from "../domain/provider-error";

const protocolToPrisma: Record<MailProtocol, PrismaMailProtocol> = {
  graph: "GRAPH",
  imap: "IMAP",
  outlook_rest_legacy: "OUTLOOK_REST_LEGACY",
};
const protocolToDomain: Record<PrismaMailProtocol, MailProtocol> = {
  GRAPH: "graph",
  IMAP: "imap",
  OUTLOOK_REST_LEGACY: "outlook_rest_legacy",
};
const stateToDomain: Record<PrismaCapabilityState, CapabilityState> = {
  UNKNOWN: "unknown",
  AVAILABLE: "available",
  DENIED: "denied",
  DISABLED: "disabled",
  TEMPORARY_FAILURE: "temporary_failure",
};

function failureState(error: ProviderError): PrismaCapabilityState {
  if (error.code === "PERMISSION_DENIED" || error.code === "AUTH_REQUIRED") return "DENIED";
  if (error.code === "MAILBOX_DISABLED") return "DISABLED";
  return "TEMPORARY_FAILURE";
}

export class PrismaCapabilityRepository implements CapabilityRepository {
  async list(accountId: string): Promise<ProtocolCapability[]> {
    const rows = await prisma.protocolCapability.findMany({ where: { accountId } });
    return rows.map((row) => ({
      protocol: protocolToDomain[row.protocol],
      state: stateToDomain[row.state],
      consecutiveFailures: row.consecutiveFailures,
      circuitOpenUntil: row.circuitOpenUntil,
      retryAfterAt: row.retryAfterAt,
      lastSuccessAt: row.lastSuccessAt,
    }));
  }

  async recordSuccess(accountId: string, protocol: MailProtocol, now: Date): Promise<void> {
    await prisma.protocolCapability.upsert({
      where: { accountId_protocol: { accountId, protocol: protocolToPrisma[protocol] } },
      create: {
        accountId,
        protocol: protocolToPrisma[protocol],
        state: "AVAILABLE",
        lastProbedAt: now,
        lastSuccessAt: now,
      },
      update: {
        state: "AVAILABLE",
        consecutiveFailures: 0,
        lastProbedAt: now,
        lastSuccessAt: now,
        lastErrorCode: null,
        circuitOpenUntil: null,
        retryAfterAt: null,
      },
    });
    await prisma.mailAccount.update({
      where: { id: accountId },
      data: { status: "healthy", lastCheckedAt: now, lastErrorCode: null, lastError: null },
    });
  }

  async recordFailure(accountId: string, protocol: MailProtocol, error: ProviderError, now: Date): Promise<void> {
    const state = failureState(error);
    const row = await prisma.protocolCapability.upsert({
      where: { accountId_protocol: { accountId, protocol: protocolToPrisma[protocol] } },
      create: {
        accountId,
        protocol: protocolToPrisma[protocol],
        state,
        consecutiveFailures: 1,
        lastProbedAt: now,
        lastFailureAt: now,
        lastErrorCode: error.code,
        retryAfterAt: error.retryAfterMs ? new Date(now.getTime() + error.retryAfterMs) : null,
      },
      update: {
        state,
        consecutiveFailures: { increment: 1 },
        lastProbedAt: now,
        lastFailureAt: now,
        lastErrorCode: error.code,
        retryAfterAt: error.retryAfterMs ? new Date(now.getTime() + error.retryAfterMs) : null,
      },
    });
    if (state === "TEMPORARY_FAILURE" && row.consecutiveFailures >= 3) {
      await prisma.protocolCapability.update({
        where: { id: row.id },
        data: { circuitOpenUntil: new Date(now.getTime() + 15 * 60_000) },
      });
    }
    const available = await prisma.protocolCapability.count({
      where: { accountId, state: "AVAILABLE" },
    });
    if (available === 0) {
      await prisma.mailAccount.update({
        where: { id: accountId },
        data: {
          status: error.code === "AUTH_REQUIRED" ? "reauth_required" : "error",
          lastCheckedAt: now,
          lastErrorCode: error.code,
          lastError: null,
        },
      });
    }
  }
}
