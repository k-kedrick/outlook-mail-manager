import argon2 from "argon2";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { resetEnvironmentForTests } from "@/shared/config/env";
import { sha256 } from "@/shared/crypto/hash";
import { totpCode } from "@/shared/crypto/totp";
import { AuthService } from "./auth-service";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3005";
  process.env.SESSION_SIGNING_KEY = "unit-session-signing-key-1234567890123456";
  process.env.DATA_ENCRYPTION_KEYS = "unit:unit-data-encryption-key-1234567890123456";
  process.env.CARD_KEY_HMAC_KEY = "unit-card-hmac-key-12345678901234567890";
  process.env.ADMIN_BOOTSTRAP_PASSWORD = "unit-bootstrap-password";
  resetEnvironmentForTests();
});

describe("AuthService", () => {
  it("completes first-run password and TOTP bootstrap with one-time recovery codes", async () => {
    let admin: any = null;
    const repository = {
      findAdmin: vi.fn(async () => admin),
      findAdminById: vi.fn(async () => admin),
      upsertBootstrapAdmin: vi.fn(async (input) => {
        admin = {
          id: "admin-1",
          username: "admin",
          passwordHash: input.passwordHash,
          totpSecretCipher: input.totpSecretCipher,
          totpConfirmedAt: null,
          bootstrapComplete: false,
          sessionVersion: 1,
        };
        return admin;
      }),
      completeBootstrap: vi.fn(async () => { admin.bootstrapComplete = true; }),
      createSession: vi.fn(async () => undefined),
    } as any;
    const service = new AuthService(repository);

    await expect(service.bootstrapRequired()).resolves.toBe(true);
    await expect(service.startBootstrap({ bootstrapPassword: "wrong-password", newPassword: "new-password-123!" }))
      .rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const started = await service.startBootstrap({
      bootstrapPassword: "unit-bootstrap-password",
      newPassword: "new-password-123!",
    });
    expect(started.otpauthUri).toContain(`secret=${started.secret}`);
    const confirmed = await service.confirmBootstrap(started.setupToken, totpCode(started.secret), {
      ip: "192.0.2.10",
      userAgent: "Vitest",
    });
    expect(confirmed.recoveryCodes).toHaveLength(10);
    expect(new Set(confirmed.recoveryCodes).size).toBe(10);
    expect(repository.completeBootstrap).toHaveBeenCalledWith("admin-1", expect.arrayContaining([expect.any(String)]));
    expect(repository.createSession).toHaveBeenCalledWith(expect.objectContaining({
      adminId: "admin-1",
      tokenHash: expect.any(String),
      csrfHash: expect.any(String),
      ipHash: expect.any(String),
      userAgentHash: expect.any(String),
    }));
  });

  it("accepts TOTP or a single-use recovery code and rejects a missing second factor", async () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const { encryptValue } = await import("@/shared/crypto/keyring");
    const passwordHash = await argon2.hash("correct-password-123!");
    const repository = {
      findAdmin: vi.fn(async () => ({
        id: "admin",
        passwordHash,
        bootstrapComplete: true,
        totpSecretCipher: encryptValue(secret).ciphertext,
      })),
      consumeRecoveryCode: vi.fn(async (_adminId, codeHash) => Boolean(codeHash)),
      createSession: vi.fn(async () => undefined),
    } as any;
    const service = new AuthService(repository);

    await expect(service.login({ password: "correct-password-123!", totp: totpCode(secret) }, {}))
      .resolves.toMatchObject({ sessionToken: expect.any(String), csrfToken: expect.any(String) });
    await expect(service.login({ password: "correct-password-123!", recoveryCode: "ABCDE-FGHIJ-KLMNO-PQRST" }, {}))
      .resolves.toMatchObject({ sessionToken: expect.any(String) });
    await expect(service.login({ password: "correct-password-123!" }, {}))
      .rejects.toMatchObject({ code: "MFA_REQUIRED" });
    expect(repository.consumeRecoveryCode).toHaveBeenCalledTimes(1);
  });

  it("authenticates, touches, validates CSRF and revokes an opaque server session", async () => {
    const session = {
      id: "session-1",
      adminId: "admin",
      username: "admin",
      csrfHash: sha256("csrf-token"),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      sessionVersion: 2,
    };
    const repository = {
      findSession: vi.fn(async () => session),
      touchSession: vi.fn(async () => undefined),
      revokeSession: vi.fn(async () => undefined),
    } as any;
    const service = new AuthService(repository);
    await expect(service.authenticate("session-token")).resolves.toBe(session);
    service.validateCsrf(session, "csrf-token");
    expect(() => service.validateCsrf(session, "wrong")).toThrowError(expect.objectContaining({ code: "SESSION_INVALID" }));
    await service.logout("session-token");
    expect(repository.touchSession).toHaveBeenCalledWith("session-1", expect.any(Date));
    expect(repository.revokeSession).toHaveBeenCalledWith(expect.any(String));
  });

  it("changes the password and revokes every server-side session atomically", async () => {
    const passwordHash = await argon2.hash("old-password-123!");
    const repository = {
      findAdminById: vi.fn(async () => ({ id: "admin", passwordHash })),
      changePasswordAndRevokeSessions: vi.fn(async () => undefined),
    } as any;
    await new AuthService(repository).changePassword("admin", "old-password-123!", "new-password-456!");
    expect(repository.changePasswordAndRevokeSessions).toHaveBeenCalledWith("admin", expect.any(String));
  });

  it("rejects an expired server-side session", async () => {
    const repository = { findSession: vi.fn(async () => ({ expiresAt: new Date(0), revokedAt: null })) } as any;
    await expect(new AuthService(repository).authenticate("session")).rejects.toMatchObject({ code: "SESSION_INVALID" });
  });
});
