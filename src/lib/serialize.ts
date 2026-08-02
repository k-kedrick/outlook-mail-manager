import type { CardKey, MailAccount, MailGroup } from "@prisma/client";
import { refreshRisk, type RiskLevel } from "@/lib/outlook/risk";

export type SerializedAccount = {
  id: string;
  email: string;
  clientId: string;
  status: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  note: string | null;
  group: { id: string; name: string; color: string | null } | null;
  createdAt: string;
  mailProtocol: string | null;
  refreshTokenUpdatedAt: string | null;
  refreshTokenExpiresAt: string | null;
  remainingValidityDays: number;
  riskLevel: RiskLevel;
  lastCode: string | null;
  lastCodeAt: string | null;
  lastCodeSubject: string | null;
  cardKey: string | null;
  has2fa: boolean;
};

export function serializeAccount(
  account: MailAccount & { group?: MailGroup | null; cardKey?: CardKey | null },
): SerializedAccount {
  const risk = refreshRisk(
    account.refreshTokenExpiresAt,
    account.refreshTokenUpdatedAt,
    account.createdAt,
  );
  return {
    id: account.id,
    email: account.email,
    clientId: account.clientId,
    status: account.status,
    lastCheckedAt: account.lastCheckedAt ? account.lastCheckedAt.toISOString() : null,
    lastError: account.lastError,
    note: account.note,
    group: account.group
      ? { id: account.group.id, name: account.group.name, color: account.group.color }
      : null,
    createdAt: account.createdAt.toISOString(),
    mailProtocol: account.mailProtocol,
    refreshTokenUpdatedAt: account.refreshTokenUpdatedAt
      ? account.refreshTokenUpdatedAt.toISOString()
      : null,
    refreshTokenExpiresAt: account.refreshTokenExpiresAt
      ? account.refreshTokenExpiresAt.toISOString()
      : null,
    remainingValidityDays: risk.remainingValidityDays,
    riskLevel: risk.riskLevel,
    lastCode: account.lastCode,
    lastCodeAt: account.lastCodeAt ? account.lastCodeAt.toISOString() : null,
    lastCodeSubject: account.lastCodeSubject,
    cardKey: account.cardKey?.code ?? null,
    // Expose only whether 2FA is configured — never the secret itself.
    has2fa: Boolean(account.totpSecretCipher),
  };
}

export function serializeGroup(group: MailGroup & { _count?: { accounts: number } }): {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  accountCount: number;
} {
  return {
    id: group.id,
    name: group.name,
    color: group.color,
    sortOrder: group.sortOrder,
    accountCount: group._count?.accounts ?? 0,
  };
}
