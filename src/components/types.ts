export type AccountStatus = "UNKNOWN" | "OK" | "AUTH_FAILED" | "LOCKED" | "ERROR";
export type RiskLevel = "FRESH" | "WARN" | "DANGER";

export type Account = {
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

export type AppConfig = {
  refreshEnabled: boolean;
  refreshIntervalDays: number;
  statusCheckEnabled: boolean;
  statusCheckIntervalMinutes: number;
  codePollEnabled: boolean;
  codePollIntervalSeconds: number;
  lastCodePollAt: string | null;
};

export type Group = {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  accountCount: number;
};

export type MailMessage = {
  id: string;
  source: "graph" | "outlook" | "imap";
  folder?: "inbox" | "junk";
  from: string;
  fromName: string | null;
  subject: string;
  receivedAt: string | null;
  preview: string;
  isRead: boolean;
  bodyHtml: string | null;
  bodyText: string | null;
};

export type AccountsResponse = {
  accounts: Account[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<string, number>;
};
