import { randomUUID } from "node:crypto";
import { decryptValue, encryptValue } from "@/shared/crypto/keyring";
import type { AccessTokenProfile, OAuthClient, OAuthGrant, OAuthRepository, TokenAccessBroker } from "../domain/oauth";
import { OAuthDomainError } from "../domain/oauth";

const TOKEN_EXPIRY_BUFFER_MS = 60_000;
const LEASE_MS = 60_000;
const LEASE_WAIT_MS = 10_000;
const MAINTENANCE_MS = 14 * 24 * 60 * 60_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TokenBroker implements TokenAccessBroker {
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(
    private readonly repository: OAuthRepository,
    private readonly client: OAuthClient,
  ) {}

  async getAccessToken(
    accountId: string,
    profile: AccessTokenProfile,
    options: { forceMaintenance?: boolean } = {},
  ): Promise<string> {
    const grant = await this.repository.findGrant(accountId, profile);
    if (!grant) throw new OAuthDomainError("AUTH_REQUIRED", false, "No OAuth grant is available for this resource");
    if (!options.forceMaintenance) {
      const cached = await this.cachedToken(grant, profile);
      if (cached) return cached;
    }
    const key = `${grant.id}:${profile}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const pending = this.refreshWithLease(grant, profile, options.forceMaintenance ?? false);
    this.inFlight.set(key, pending);
    try {
      return await pending;
    } finally {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    }
  }

  private async cachedToken(grant: OAuthGrant, profile: AccessTokenProfile): Promise<string | null> {
    const cached = await this.repository.findCachedToken(grant.id, profile);
    if (!cached || cached.expiresAt.getTime() - TOKEN_EXPIRY_BUFFER_MS <= Date.now()) return null;
    try {
      return decryptValue(cached.tokenCipher);
    } catch {
      return null;
    }
  }

  private async refreshWithLease(
    initialGrant: OAuthGrant,
    profile: AccessTokenProfile,
    forceMaintenance: boolean,
  ): Promise<string> {
    let grant = initialGrant;
    const initialVersion = initialGrant.version;
    const owner = randomUUID();
    const deadline = Date.now() + LEASE_WAIT_MS;
    while (!(await this.repository.claimRefreshLease(grant.id, owner, new Date(), new Date(Date.now() + LEASE_MS)))) {
      if (!forceMaintenance) {
        const cached = await this.cachedToken(grant, profile);
        if (cached) return cached;
      }
      if (Date.now() >= deadline) throw new OAuthDomainError("REFRESH_BUSY", true, "Token refresh lease is busy", 1_000);
      await wait(200 + Math.floor(Math.random() * 150));
      const latest = await this.repository.findGrant(grant.accountId, profile);
      if (!latest) throw new OAuthDomainError("AUTH_REQUIRED", false, "OAuth grant is no longer active");
      grant = latest;
      // A peer completed the exact same profile while this request waited.
      // Even forced maintenance must treat that real exchange as its result.
      if (forceMaintenance && grant.version !== initialVersion) {
        const refreshedByPeer = await this.cachedToken(grant, profile);
        if (refreshedByPeer) return refreshedByPeer;
      }
    }

    try {
      const tokens = await this.client.refresh(grant, profile, decryptValue(grant.refreshTokenCipher));
      const access = encryptValue(tokens.accessToken);
      const refresh = tokens.refreshToken ? encryptValue(tokens.refreshToken) : undefined;
      const rotatedAt = new Date();
      const completed = await this.repository.completeRefresh({
        grantId: grant.id,
        owner,
        expectedVersion: grant.version,
        refreshTokenCipher: refresh?.ciphertext,
        refreshTokenKeyId: refresh?.keyId,
        profile,
        accessTokenCipher: access.ciphertext,
        accessTokenKeyId: access.keyId,
        accessTokenExpiresAt: tokens.expiresAt,
        providerExpiresAt: tokens.providerRefreshExpiresAt,
        nextMaintenanceAt: new Date(rotatedAt.getTime() + MAINTENANCE_MS),
        rotatedAt,
      });
      if (!completed) {
        await this.repository.releaseRefreshLease(grant.id, owner, "VERSION_CONFLICT");
        const latest = await this.repository.findGrant(grant.accountId, profile);
        if (!latest) throw new OAuthDomainError("AUTH_REQUIRED", false, "OAuth grant is no longer active");
        const refreshedByPeer = await this.cachedToken(latest, profile);
        if (refreshedByPeer) return refreshedByPeer;
        return this.refreshWithLease(latest, profile, forceMaintenance);
      }
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof OAuthDomainError && error.code === "AUTH_REQUIRED") {
        await this.repository.markGrantStatus(grant.id, "reauth_required", error.code);
      } else {
        await this.repository.releaseRefreshLease(
          grant.id,
          owner,
          error instanceof OAuthDomainError ? error.code : "TOKEN_REFRESH_FAILED",
        );
      }
      throw error;
    }
  }
}
