import type { AccountType as PrismaAccountType, MailProtocol as PrismaMailProtocol } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import type {
  Account,
  AccountRepository,
  AccountStatus,
  AccountType,
} from "../domain/account";
import type { MailProtocol } from "@/modules/mail/domain/mail-provider";

const accountTypeToDomain: Record<PrismaAccountType, AccountType> = {
  UNKNOWN: "unknown",
  PERSONAL: "personal",
  ORGANIZATION: "organization",
};

const accountTypeToPrisma: Record<AccountType, PrismaAccountType> = {
  unknown: "UNKNOWN",
  personal: "PERSONAL",
  organization: "ORGANIZATION",
};

const protocolToDomain: Record<PrismaMailProtocol, MailProtocol> = {
  GRAPH: "graph",
  IMAP: "imap",
  OUTLOOK_REST_LEGACY: "outlook_rest_legacy",
};

const protocolToPrisma: Record<MailProtocol, PrismaMailProtocol> = {
  graph: "GRAPH",
  imap: "IMAP",
  outlook_rest_legacy: "OUTLOOK_REST_LEGACY",
};

function accountStatus(value: string): AccountStatus {
  if (["healthy", "reauth_required", "locked", "error", "unknown"].includes(value)) {
    return value as AccountStatus;
  }
  if (value === "OK") return "healthy";
  if (value === "AUTH_FAILED") return "reauth_required";
  if (value === "LOCKED") return "locked";
  if (value === "ERROR") return "error";
  return "unknown";
}

function mapAccount(row: {
  id: string;
  email: string;
  normalizedEmail: string;
  providerSubject: string | null;
  tenantId: string | null;
  issuer: string | null;
  accountType: PrismaAccountType;
  status: string;
  preferredProtocol: PrismaMailProtocol | null;
  lastCheckedAt: Date | null;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  rowVersion: number;
}): Account {
  return {
    ...row,
    accountType: accountTypeToDomain[row.accountType],
    status: accountStatus(row.status),
    preferredProtocol: row.preferredProtocol ? protocolToDomain[row.preferredProtocol] : null,
  };
}

export class PrismaAccountRepository implements AccountRepository {
  async findById(id: string): Promise<Account | null> {
    const row = await prisma.mailAccount.findUnique({ where: { id } });
    return row ? mapAccount(row) : null;
  }

  async findByIdentity(issuer: string, subject: string): Promise<Account | null> {
    const row = await prisma.mailAccount.findUnique({
      where: { issuer_providerSubject: { issuer, providerSubject: subject } },
    });
    return row ? mapAccount(row) : null;
  }

  async findByEmail(email: string): Promise<Account | null> {
    const row = await prisma.mailAccount.findUnique({ where: { normalizedEmail: email.trim().toLowerCase() } });
    return row ? mapAccount(row) : null;
  }

  async saveIdentity(
    input: Omit<Account, "id" | "createdAt" | "updatedAt" | "rowVersion"> & { id?: string },
  ): Promise<Account> {
    const normalizedEmail = input.normalizedEmail.trim().toLowerCase();
    const existing = input.id
      ? { id: input.id }
      : input.issuer && input.providerSubject
      ? await prisma.mailAccount.findUnique({
          where: { issuer_providerSubject: { issuer: input.issuer, providerSubject: input.providerSubject } },
          select: { id: true },
        })
      : await prisma.mailAccount.findUnique({ where: { normalizedEmail }, select: { id: true } });
    const data = {
      email: input.email,
      normalizedEmail,
      providerSubject: input.providerSubject,
      tenantId: input.tenantId,
      issuer: input.issuer,
      accountType: accountTypeToPrisma[input.accountType],
      status: input.status,
      preferredProtocol: input.preferredProtocol ? protocolToPrisma[input.preferredProtocol] : null,
      lastCheckedAt: input.lastCheckedAt,
      lastErrorCode: input.lastErrorCode,
    };
    const row = existing
      ? await prisma.mailAccount.update({ where: { id: existing.id }, data: { ...data, rowVersion: { increment: 1 } } })
      : await prisma.mailAccount.create({ data });
    return mapAccount(row);
  }
}
