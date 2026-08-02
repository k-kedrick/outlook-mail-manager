export type CardKeyAccount = { id: string; email: string; hasCardKey: boolean };
export type ResolvedCardKey = {
  id: string;
  accountId: string;
  account: { email: string; secret: { totpCipher: string | null } | null };
};

export class CardKeyCollisionError extends Error {
  constructor() {
    super("CARD_KEY_COLLISION");
    this.name = "CardKeyCollisionError";
  }
}

export interface CardKeyRepository {
  findAccounts(ids: string[]): Promise<CardKeyAccount[]>;
  save(input: { accountId: string; codeHash: string; codePrefix: string | null; codeLast4: string }): Promise<void>;
  findByHash(codeHash: string): Promise<ResolvedCardKey | null>;
}

export type CodeRequestRecord = {
  id: string;
  accountId: string;
  status: "pending" | "running" | "found" | "expired" | "failed";
  resultCodeCipher: string | null;
  resultSubject: string | null;
  resultFrom: string | null;
  resultReceivedAt: Date | null;
  lastErrorCode: string | null;
  expiresAt: Date;
};

export interface CodeRequestRepository {
  create(input: { accountId: string; cardKeyId: string; retrievalTokenHash: string; expiresAt: Date }): Promise<CodeRequestRecord>;
  findByCredential(id: string, retrievalTokenHash: string): Promise<CodeRequestRecord | null>;
  findById(id: string): Promise<CodeRequestRecord | null>;
  markRunning(id: string): Promise<void>;
  markPending(id: string): Promise<void>;
  markExpired(id: string): Promise<void>;
  markFailed(id: string, errorCode: string): Promise<void>;
  markFound(input: {
    id: string;
    resultCodeCipher: string;
    resultKeyId: string;
    subject: string;
    from: string;
    receivedAt: Date;
  }): Promise<void>;
}
