export type MailProtocol = "graph" | "imap" | "outlook_rest_legacy";
export type MailFolder = "inbox" | "junk";
export type TokenProfile = "graph_mail" | "imap_mail" | "outlook_rest_legacy";

export type ProviderAccount = {
  id: string;
  email: string;
};

export type MailMessage = {
  id: string;
  protocol: MailProtocol;
  folder: MailFolder;
  from: string;
  fromName: string | null;
  subject: string;
  receivedAt: string | null;
  preview: string;
  isRead: boolean;
  bodyText: string | null;
  bodyHtml: string | null;
};

export type MailPage = {
  messages: MailMessage[];
  nextCursor: string | null;
};

export type ProbeResult = {
  available: boolean;
  latencyMs: number;
};

export type TokenResolver = (accountId: string, profile: TokenProfile) => Promise<string>;

export type ListMessagesInput = {
  account: ProviderAccount;
  folder: MailFolder;
  limit: number;
  cursor?: string;
  resolveToken: TokenResolver;
};

export type GetMessageInput = {
  account: ProviderAccount;
  folder: MailFolder;
  messageId: string;
  resolveToken: TokenResolver;
};

export type ProbeInput = {
  account: ProviderAccount;
  resolveToken: TokenResolver;
};

export interface MailProvider {
  readonly protocol: MailProtocol;
  probe(input: ProbeInput): Promise<ProbeResult>;
  listMessages(input: ListMessagesInput): Promise<MailPage>;
  getMessage(input: GetMessageInput): Promise<MailMessage>;
}

export interface MailRoutingService {
  list(input: { accountId: string; folder: MailFolder; limit: number; cursor?: string }): Promise<MailPage>;
  getMessage(input: { accountId: string; folder: MailFolder; messageId: string }): Promise<MailMessage>;
  health(accountId: string): Promise<{ protocol: MailProtocol; available: true }>;
  probe(accountId: string): Promise<Array<{ protocol: MailProtocol; available: boolean; errorCode?: string }>>;
}
