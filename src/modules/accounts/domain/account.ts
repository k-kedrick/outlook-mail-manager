import type { MailProtocol } from "@/modules/mail/domain/mail-provider";

export type AccountType = "unknown" | "personal" | "organization";
export type AccountStatus = "unknown" | "healthy" | "reauth_required" | "locked" | "error";

export type Account = {
  id: string;
  email: string;
  normalizedEmail: string;
  providerSubject: string | null;
  tenantId: string | null;
  issuer: string | null;
  accountType: AccountType;
  status: AccountStatus;
  preferredProtocol: MailProtocol | null;
  lastCheckedAt: Date | null;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  rowVersion: number;
};

export interface AccountRepository {
  findById(id: string): Promise<Account | null>;
  findByIdentity(issuer: string, subject: string): Promise<Account | null>;
  findByEmail(email: string): Promise<Account | null>;
  saveIdentity(
    input: Omit<Account, "id" | "createdAt" | "updatedAt" | "rowVersion"> & { id?: string },
  ): Promise<Account>;
}
