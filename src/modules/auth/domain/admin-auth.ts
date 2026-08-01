export type AdminIdentity = {
  id: string;
  username: string;
  passwordHash: string;
  totpSecretCipher: string | null;
  totpConfirmedAt: Date | null;
  bootstrapComplete: boolean;
  sessionVersion: number;
};

export type AdminSessionIdentity = {
  id: string;
  adminId: string;
  username: string;
  csrfHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  sessionVersion: number;
};

export interface AdminAuthRepository {
  findAdmin(username: string): Promise<AdminIdentity | null>;
  findAdminById(id: string): Promise<AdminIdentity | null>;
  upsertBootstrapAdmin(input: {
    username: string;
    passwordHash: string;
    totpSecretCipher: string;
  }): Promise<AdminIdentity>;
  completeBootstrap(adminId: string, recoveryCodeHashes: string[]): Promise<void>;
  createSession(input: {
    adminId: string;
    tokenHash: string;
    csrfHash: string;
    expiresAt: Date;
    ipHash?: string;
    userAgentHash?: string;
  }): Promise<void>;
  changePasswordAndRevokeSessions(adminId: string, passwordHash: string): Promise<void>;
  findSession(tokenHash: string): Promise<AdminSessionIdentity | null>;
  touchSession(id: string, at: Date): Promise<void>;
  revokeSession(tokenHash: string): Promise<void>;
  revokeAllSessions(adminId: string): Promise<void>;
  consumeRecoveryCode(adminId: string, codeHash: string): Promise<boolean>;
}

export class AuthenticationError extends Error {
  constructor(readonly code: "INVALID_CREDENTIALS" | "BOOTSTRAP_DISABLED" | "MFA_REQUIRED" | "SESSION_INVALID") {
    super(code);
    this.name = "AuthenticationError";
  }
}
