import { beforeAll, describe, expect, it, vi } from "vitest";
import { encryptValue } from "@/shared/crypto/keyring";
import { resetEnvironmentForTests } from "@/shared/config/env";
import { OAuthFlowService } from "./oauth-flow-service";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3005";
  process.env.SESSION_SIGNING_KEY = "unit-session-signing-key-1234567890123456";
  process.env.DATA_ENCRYPTION_KEYS = "unit:unit-data-encryption-key-1234567890123456";
  process.env.CARD_KEY_HMAC_KEY = "unit-card-hmac-key-12345678901234567890";
  process.env.ADMIN_BOOTSTRAP_PASSWORD = "unit-bootstrap-password";
  process.env.MICROSOFT_CLIENT_ID = "5e5f0f01-1111-4111-8111-111111111111";
  resetEnvironmentForTests();
});

const account = {
  id: "account-1", email: "one@example.com", normalizedEmail: "one@example.com", providerSubject: "subject",
  tenantId: "tenant", issuer: "https://login.microsoftonline.com/tenant/v2.0", accountType: "organization" as const,
  status: "healthy" as const, preferredProtocol: null, lastCheckedAt: null, lastErrorCode: null,
  createdAt: new Date(), updatedAt: new Date(), rowVersion: 1,
};

describe("OAuthFlowService", () => {
  it("creates a short-lived PKCE Graph flow without exposing the verifier", async () => {
    const repository = { createFlow: vi.fn(async () => undefined) } as any;
    const accounts = { findById: vi.fn() } as any;
    const client = { authorizationUrl: vi.fn(() => "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?safe=1") } as any;
    const service = new OAuthFlowService(repository, accounts, client);
    await expect(service.start({ adminId: "admin", resource: "graph" })).resolves.toEqual({
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?safe=1",
    });
    expect(repository.createFlow).toHaveBeenCalledWith(expect.objectContaining({
      adminId: "admin",
      resource: "graph",
      stateHash: expect.any(String),
      nonceHash: expect.any(String),
      pkceVerifierCipher: expect.stringMatching(/^v2:/),
      expiresAt: expect.any(Date),
    }));
    const authorizationInput = client.authorizationUrl.mock.calls[0][0];
    expect(authorizationInput.state).not.toBe(repository.createFlow.mock.calls[0][0].stateHash);
    expect(authorizationInput).not.toHaveProperty("verifier");
  });

  it("requires Graph identity before starting the separate IMAP grant", async () => {
    const repository = { createFlow: vi.fn() } as any;
    const accounts = { findById: vi.fn(async () => null) } as any;
    const service = new OAuthFlowService(repository, accounts, {} as any);
    await expect(service.start({ adminId: "admin", resource: "outlook_imap", accountId: "missing" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("binds a Graph reauthorization flow to the requested existing account", async () => {
    const repository = { createFlow: vi.fn(async () => undefined) } as any;
    const accounts = { findById: vi.fn(async () => account) } as any;
    const client = { authorizationUrl: vi.fn(() => "https://login.microsoftonline.com/common/oauth2/v2.0/authorize") } as any;
    const service = new OAuthFlowService(repository, accounts, client);

    await service.start({ adminId: "admin", resource: "graph", accountId: account.id });

    expect(repository.createFlow).toHaveBeenCalledWith(expect.objectContaining({
      accountId: account.id,
      expectedSubject: account.providerSubject,
      expectedTenantId: account.tenantId,
    }));
    expect(client.authorizationUrl).toHaveBeenCalledWith(expect.objectContaining({ loginHint: account.email }));
  });

  it("persists identity, grant and profile-specific access token after callback", async () => {
    const oauthRepository = {
      consumeFlow: vi.fn(async () => ({
        id: "flow", adminId: "admin", accountId: null, resource: "graph", nonceHash: "nonce-hash",
        pkceVerifierCipher: encryptValue("verifier").ciphertext, expectedSubject: null, expectedTenantId: null,
        expiresAt: new Date(Date.now() + 60_000),
      })),
      upsertGrant: vi.fn(async () => ({ id: "grant-1" })),
      saveAccessToken: vi.fn(async () => undefined),
    } as any;
    const accounts = { findByIdentity: vi.fn(async () => null), saveIdentity: vi.fn(async () => account) } as any;
    const client = {
      redeemAuthorizationCode: vi.fn(async () => ({ accessToken: "access", refreshToken: "refresh", idToken: "id", expiresAt: new Date(Date.now() + 3600_000), scopes: ["Mail.Read"] })),
      verifyIdentity: vi.fn(async () => ({ subject: "subject", tenantId: "tenant", issuer: account.issuer, email: account.email, accountType: "organization" })),
    } as any;
    const result = await new OAuthFlowService(oauthRepository, accounts, client).callback("code", "state");
    expect(result).toEqual({ account, resource: "graph" });
    expect(accounts.saveIdentity).toHaveBeenCalledWith(expect.objectContaining({ id: undefined }));
    expect(oauthRepository.upsertGrant).toHaveBeenCalledWith(expect.objectContaining({ resource: "graph", accountId: account.id }));
    expect(oauthRepository.saveAccessToken).toHaveBeenCalledWith(expect.objectContaining({ profile: "graph_mail", grantId: "grant-1" }));
  });

  it("rejects an expired state before exchanging a code", async () => {
    const oauthRepository = { consumeFlow: vi.fn(async () => null) } as any;
    const client = { redeemAuthorizationCode: vi.fn() } as any;
    const service = new OAuthFlowService(oauthRepository, {} as any, client);
    await expect(service.callback("code", "expired-state")).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(client.redeemAuthorizationCode).not.toHaveBeenCalled();
  });

  it("prevents the second grant from being attached to a different Microsoft identity", async () => {
    const oauthRepository = {
      consumeFlow: vi.fn(async () => ({
        id: "flow",
        adminId: "admin",
        accountId: account.id,
        resource: "outlook_imap",
        nonceHash: "nonce-hash",
        pkceVerifierCipher: encryptValue("verifier").ciphertext,
        expectedSubject: account.providerSubject,
        expectedTenantId: account.tenantId,
        expiresAt: new Date(Date.now() + 60_000),
      })),
      upsertGrant: vi.fn(),
    } as any;
    const client = {
      redeemAuthorizationCode: vi.fn(async () => ({
        accessToken: "imap-access",
        refreshToken: "imap-refresh",
        idToken: "id",
        expiresAt: new Date(Date.now() + 3_600_000),
        scopes: [],
      })),
      verifyIdentity: vi.fn(async () => ({
        subject: "different-subject",
        tenantId: account.tenantId,
        issuer: account.issuer,
        email: "other@example.com",
        accountType: "organization",
      })),
    } as any;
    const service = new OAuthFlowService(oauthRepository, {} as any, client);
    await expect(service.callback("code", "state")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(oauthRepository.upsertGrant).not.toHaveBeenCalled();
  });
});
