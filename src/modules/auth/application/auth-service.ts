import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { decryptValue, encryptValue } from "@/shared/crypto/keyring";
import { hmacValue, safeEqual, sessionTokenHash, sha256 } from "@/shared/crypto/hash";
import { createTotpSecret, verifyTotp } from "@/shared/crypto/totp";
import { env } from "@/shared/config/env";
import type { AdminAuthRepository, AdminSessionIdentity } from "../domain/admin-auth";
import { AuthenticationError } from "../domain/admin-auth";

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SETUP_TTL_MS = 15 * 60 * 1000;

type SetupToken = { kind: "admin-setup"; adminId: string; expiresAt: number };

export type SessionTokens = { sessionToken: string; csrfToken: string; expiresAt: Date };

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function recoveryCode(): string {
  const raw = randomBytes(10).toString("hex").toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
}

export class AuthService {
  constructor(private readonly repository: AdminAuthRepository) {}

  async bootstrapRequired(): Promise<boolean> {
    const admin = await this.repository.findAdmin("admin");
    return !admin?.bootstrapComplete;
  }

  async startBootstrap(input: {
    bootstrapPassword: string;
    newPassword: string;
    appName?: string;
  }): Promise<{ setupToken: string; secret: string; otpauthUri: string }> {
    if (!safeEqual(input.bootstrapPassword, env().ADMIN_BOOTSTRAP_PASSWORD)) {
      throw new AuthenticationError("INVALID_CREDENTIALS");
    }
    const existing = await this.repository.findAdmin("admin");
    if (existing?.bootstrapComplete) throw new AuthenticationError("BOOTSTRAP_DISABLED");
    const secret = createTotpSecret();
    const encrypted = encryptValue(secret);
    const admin = await this.repository.upsertBootstrapAdmin({
      username: "admin",
      passwordHash: await argon2.hash(input.newPassword, { type: argon2.argon2id }),
      totpSecretCipher: encrypted.ciphertext,
    });
    const setupToken = encryptValue(
      JSON.stringify({ kind: "admin-setup", adminId: admin.id, expiresAt: Date.now() + SETUP_TTL_MS } satisfies SetupToken),
    ).ciphertext;
    const issuer = encodeURIComponent(input.appName ?? "Outlook Mail Manager");
    const label = encodeURIComponent("Outlook Mail Manager:admin");
    return {
      setupToken,
      secret,
      otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
    };
  }

  async confirmBootstrap(setupToken: string, code: string, context: { ip?: string; userAgent?: string }): Promise<{
    session: SessionTokens;
    recoveryCodes: string[];
  }> {
    let setup: SetupToken;
    try {
      setup = JSON.parse(decryptValue(setupToken)) as SetupToken;
    } catch {
      throw new AuthenticationError("INVALID_CREDENTIALS");
    }
    if (setup.kind !== "admin-setup" || setup.expiresAt <= Date.now()) {
      throw new AuthenticationError("INVALID_CREDENTIALS");
    }
    const admin = await this.repository.findAdminById(setup.adminId);
    if (!admin?.totpSecretCipher || admin.bootstrapComplete) {
      throw new AuthenticationError("BOOTSTRAP_DISABLED");
    }
    if (!verifyTotp(decryptValue(admin.totpSecretCipher), code)) {
      throw new AuthenticationError("INVALID_CREDENTIALS");
    }
    const recoveryCodes = Array.from({ length: 10 }, recoveryCode);
    await this.repository.completeBootstrap(admin.id, recoveryCodes.map((value) => hmacValue(value)));
    return { session: await this.createSession(admin.id, context), recoveryCodes };
  }

  async login(input: { password: string; totp?: string; recoveryCode?: string }, context: {
    ip?: string;
    userAgent?: string;
  }): Promise<SessionTokens> {
    const admin = await this.repository.findAdmin("admin");
    if (!admin?.bootstrapComplete || !(await argon2.verify(admin.passwordHash, input.password))) {
      throw new AuthenticationError("INVALID_CREDENTIALS");
    }
    let secondFactorValid = false;
    if (input.totp && admin.totpSecretCipher) {
      secondFactorValid = verifyTotp(decryptValue(admin.totpSecretCipher), input.totp);
    } else if (input.recoveryCode) {
      secondFactorValid = await this.repository.consumeRecoveryCode(admin.id, hmacValue(input.recoveryCode));
    }
    if (!secondFactorValid) throw new AuthenticationError("MFA_REQUIRED");
    return this.createSession(admin.id, context);
  }

  async authenticate(sessionToken: string | undefined): Promise<AdminSessionIdentity> {
    if (!sessionToken) throw new AuthenticationError("SESSION_INVALID");
    const session = await this.repository.findSession(sessionTokenHash(sessionToken));
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new AuthenticationError("SESSION_INVALID");
    }
    void this.repository.touchSession(session.id, new Date()).catch(() => undefined);
    return session;
  }

  async logout(sessionToken: string | undefined): Promise<void> {
    if (sessionToken) await this.repository.revokeSession(sessionTokenHash(sessionToken));
  }

  async changePassword(adminId: string, currentPassword: string, newPassword: string): Promise<void> {
    const admin = await this.repository.findAdminById(adminId);
    if (!admin || !(await argon2.verify(admin.passwordHash, currentPassword))) {
      throw new AuthenticationError("INVALID_CREDENTIALS");
    }
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.repository.changePasswordAndRevokeSessions(admin.id, passwordHash);
  }

  validateCsrf(session: AdminSessionIdentity, csrfToken: string | undefined): void {
    if (!csrfToken || !safeEqual(session.csrfHash, sha256(csrfToken))) {
      throw new AuthenticationError("SESSION_INVALID");
    }
  }

  private async createSession(adminId: string, context: { ip?: string; userAgent?: string }): Promise<SessionTokens> {
    const sessionToken = randomToken();
    const csrfToken = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.repository.createSession({
      adminId,
      tokenHash: sessionTokenHash(sessionToken),
      csrfHash: sha256(csrfToken),
      expiresAt,
      ipHash: context.ip ? hmacValue(context.ip) : undefined,
      userAgentHash: context.userAgent ? hmacValue(context.userAgent) : undefined,
    });
    return { sessionToken, csrfToken, expiresAt };
  }
}
