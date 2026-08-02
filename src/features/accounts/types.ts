export type Capability = {
  protocol: "graph" | "imap" | "outlook_rest_legacy";
  state: string;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  circuitOpenUntil: string | null;
  lastErrorCode: string | null;
};

export type Grant = {
  id: string;
  resource: string;
  source: string;
  status: string;
  lastRotatedAt: string | null;
  lastVerifiedAt: string | null;
  nextMaintenanceAt: string | null;
  providerExpiresAt: string | null;
  lastErrorCode: string | null;
};

export type Account = {
  id: string;
  email: string;
  accountType: string;
  status: string;
  preferredProtocol: string | null;
  lastCheckedAt: string | null;
  lastErrorCode: string | null;
  group: { id: string; name: string; color: string | null } | null;
  hasPassword: boolean;
  hasTotp: boolean;
  cardKey: { prefix: string | null; last4: string | null } | null;
  capabilities: Capability[];
  grants: Grant[];
  createdAt: string;
};

export type AccountPage = { accounts: Account[]; nextCursor: string | null };
export type AccountGroup = { id: string; name: string; color: string | null; _count: { accounts: number } };
