import type { MailProtocol } from "@/modules/mail/domain/mail-provider";

export type AccountAdminListInput = { limit: number; cursor?: string; query?: string };
export type AccountAdminPatch = { groupId?: string | null; preferredProtocol?: MailProtocol | null; note?: string | null };

export type AccountAdminListItem = {
  id: string;
  email: string;
  accountType: string;
  status: string;
  preferredProtocol: MailProtocol | null;
  lastCheckedAt: Date | null;
  lastErrorCode: string | null;
  group: { id: string; name: string; color: string | null } | null;
  hasPassword: boolean;
  hasTotp: boolean;
  cardKey: { prefix: string | null; last4: string | null } | null;
  capabilities: Array<{
    protocol: string;
    state: string;
    consecutiveFailures: number;
    lastSuccessAt: Date | null;
    circuitOpenUntil: Date | null;
    lastErrorCode: string | null;
  }>;
  grants: Array<{
    id: string;
    resource: string;
    source: string;
    status: string;
    lastRotatedAt: Date | null;
    lastVerifiedAt: Date | null;
    nextMaintenanceAt: Date | null;
    providerExpiresAt: Date | null;
    lastErrorCode: string | null;
  }>;
  createdAt: Date;
};

export type RevealedAccount = {
  email: string;
  password: string | null;
  totpSecret: string | null;
  grants: Array<{ resource: string; source: string; clientId: string; refreshToken: string }>;
};

export interface AccountAdminRepository {
  list(input: AccountAdminListInput): Promise<{ accounts: AccountAdminListItem[]; nextCursor: string | null }>;
  update(id: string, input: AccountAdminPatch): Promise<{ id: string; email: string } | null>;
  delete(id: string): Promise<{ id: string; email: string } | null>;
  export(accountIds: string[]): Promise<{ count: number; text: string }>;
  reveal(id: string): Promise<RevealedAccount | null>;
}

export class AccountNotFoundError extends Error {
  constructor() {
    super("ACCOUNT_NOT_FOUND");
    this.name = "AccountNotFoundError";
  }
}
