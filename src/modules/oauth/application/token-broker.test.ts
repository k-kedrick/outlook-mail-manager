import { beforeAll, describe, expect, it, vi } from "vitest";
import { encryptValue } from "@/shared/crypto/keyring";
import { resetEnvironmentForTests } from "@/shared/config/env";
import type { OAuthGrant } from "../domain/oauth";
import { OAuthDomainError } from "../domain/oauth";
import { TokenBroker } from "./token-broker";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3005";
  process.env.SESSION_SIGNING_KEY = "unit-session-signing-key-1234567890123456";
  process.env.DATA_ENCRYPTION_KEYS = "unit:unit-data-encryption-key-1234567890123456";
  process.env.CARD_KEY_HMAC_KEY = "unit-card-hmac-key-12345678901234567890";
  process.env.ADMIN_BOOTSTRAP_PASSWORD = "unit-bootstrap-password";
  resetEnvironmentForTests();
});

describe("TokenBroker concurrency", () => {
  it("shares one real exchange for concurrent requests of the same grant/profile", async () => {
    const grant: OAuthGrant = {
      id: "grant-1",
      accountId: "account-1",
      resource: "graph",
      source: "managed",
      status: "active",
      clientId: "client",
      tenantId: "tenant",
      refreshTokenCipher: encryptValue("refresh-token").ciphertext,
      version: 1,
      grantedScopes: [],
      refreshLeaseOwner: null,
      refreshLeaseExpiresAt: null,
    };
    const repository = {
      findGrant: vi.fn(async () => grant),
      findCachedToken: vi.fn(async () => null),
      claimRefreshLease: vi.fn(async () => true),
      completeRefresh: vi.fn(async () => true),
      releaseRefreshLease: vi.fn(async () => undefined),
      markGrantStatus: vi.fn(async () => undefined),
    } as any;
    const refresh = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { accessToken: "access-token", expiresAt: new Date(Date.now() + 3_600_000), scopes: [] };
    });
    const broker = new TokenBroker(repository, { refresh } as any);
    const [first, second] = await Promise.all([
      broker.getAccessToken("account-1", "graph_mail", { forceMaintenance: true }),
      broker.getAccessToken("account-1", "graph_mail", { forceMaintenance: true }),
    ]);
    expect(first).toBe("access-token");
    expect(second).toBe("access-token");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(repository.completeRefresh).toHaveBeenCalledTimes(1);
  });

  it("returns an unexpired profile cache without touching the refresh lease", async () => {
    const grant = createGrant();
    const repository = {
      findGrant: vi.fn(async () => grant),
      findCachedToken: vi.fn(async () => ({
        tokenCipher: encryptValue("cached-access-token").ciphertext,
        expiresAt: new Date(Date.now() + 3_600_000),
      })),
      claimRefreshLease: vi.fn(),
    } as any;
    const broker = new TokenBroker(repository, { refresh: vi.fn() } as any);
    await expect(broker.getAccessToken("account-1", "graph_mail")).resolves.toBe("cached-access-token");
    expect(repository.claimRefreshLease).not.toHaveBeenCalled();
  });

  it("marks invalid grants for reauthorization without leaking the provider error", async () => {
    const grant = createGrant();
    const repository = refreshRepository(grant);
    const client = {
      refresh: vi.fn(async () => { throw new OAuthDomainError("AUTH_REQUIRED", false, "provider detail"); }),
    } as any;
    const broker = new TokenBroker(repository, client);
    await expect(broker.getAccessToken("account-1", "graph_mail", { forceMaintenance: true }))
      .rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(repository.markGrantStatus).toHaveBeenCalledWith("grant-1", "reauth_required", "AUTH_REQUIRED");
    expect(repository.releaseRefreshLease).not.toHaveBeenCalled();
  });

  it("recovers from an optimistic version conflict by rereading the peer cache", async () => {
    const initial = createGrant();
    const latest = { ...initial, version: 2 };
    const repository = refreshRepository(initial);
    repository.completeRefresh.mockResolvedValueOnce(false);
    repository.findGrant.mockResolvedValueOnce(initial).mockResolvedValueOnce(latest);
    repository.findCachedToken.mockResolvedValueOnce({
      tokenCipher: encryptValue("peer-access-token").ciphertext,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const client = {
      refresh: vi.fn(async () => ({ accessToken: "discarded-local-token", expiresAt: new Date(Date.now() + 3_600_000), scopes: [] })),
    } as any;
    const broker = new TokenBroker(repository, client);
    await expect(broker.getAccessToken("account-1", "graph_mail", { forceMaintenance: true }))
      .resolves.toBe("peer-access-token");
    expect(repository.releaseRefreshLease).toHaveBeenCalledWith("grant-1", expect.any(String), "VERSION_CONFLICT");
    expect(client.refresh).toHaveBeenCalledTimes(1);
  });
});

function createGrant(): OAuthGrant {
  return {
    id: "grant-1",
    accountId: "account-1",
    resource: "graph",
    source: "managed",
    status: "active",
    clientId: "client",
    tenantId: "tenant",
    refreshTokenCipher: encryptValue("refresh-token").ciphertext,
    version: 1,
    grantedScopes: [],
    refreshLeaseOwner: null,
    refreshLeaseExpiresAt: null,
  };
}

function refreshRepository(grant: OAuthGrant) {
  return {
    findGrant: vi.fn(async () => grant),
    findCachedToken: vi.fn(async () => null),
    claimRefreshLease: vi.fn(async () => true),
    completeRefresh: vi.fn(async () => true),
    releaseRefreshLease: vi.fn(async () => undefined),
    markGrantStatus: vi.fn(async () => undefined),
  } as any;
}
