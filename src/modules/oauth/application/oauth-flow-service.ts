import { randomBytes } from "node:crypto";
import type { Account, AccountRepository } from "@/modules/accounts/domain/account";
import { decryptValue, encryptValue } from "@/shared/crypto/keyring";
import { sha256 } from "@/shared/crypto/hash";
import { env } from "@/shared/config/env";
import type { OAuthClient, OAuthRepository } from "../domain/oauth";
import { OAuthDomainError, RESOURCE_SCOPES } from "../domain/oauth";

const FLOW_TTL_MS = 10 * 60_000;
const MAINTENANCE_MS = 14 * 24 * 60 * 60_000;

function randomToken(size = 32): string {
  return randomBytes(size).toString("base64url");
}

export class OAuthFlowService {
  constructor(
    private readonly oauthRepository: OAuthRepository,
    private readonly accountRepository: AccountRepository,
    private readonly client: OAuthClient,
  ) {}

  async start(input: {
    adminId: string;
    resource: "graph" | "outlook_imap";
    accountId?: string;
  }): Promise<{ authorizationUrl: string }> {
    let account: Account | null = null;
    if (input.accountId) {
      account = await this.accountRepository.findById(input.accountId);
      if (!account) throw new OAuthDomainError("INVALID_RESPONSE", false, "Account does not exist");
    }
    if (input.resource === "outlook_imap") {
      if (!input.accountId) throw new OAuthDomainError("INVALID_RESPONSE", false, "IMAP authorization requires an account");
      if (!account?.providerSubject || !account.tenantId) {
        throw new OAuthDomainError("INVALID_RESPONSE", false, "Graph authorization must be completed first");
      }
    }
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken(48);
    const encryptedVerifier = encryptValue(verifier);
    await this.oauthRepository.createFlow({
      adminId: input.adminId,
      accountId: account?.id,
      resource: input.resource,
      stateHash: sha256(state),
      nonceHash: sha256(nonce),
      pkceVerifierCipher: encryptedVerifier.ciphertext,
      expectedSubject: account?.providerSubject ?? undefined,
      expectedTenantId: account?.tenantId ?? undefined,
      expiresAt: new Date(Date.now() + FLOW_TTL_MS),
    });
    return {
      authorizationUrl: this.client.authorizationUrl({
        resource: input.resource,
        state,
        nonce,
        codeChallenge: sha256(verifier),
        loginHint: account?.email,
      }),
    };
  }

  async callback(code: string, state: string): Promise<{ account: Account; resource: "graph" | "outlook_imap" }> {
    const flow = await this.oauthRepository.consumeFlow(sha256(state), new Date());
    if (!flow || (flow.resource !== "graph" && flow.resource !== "outlook_imap")) {
      throw new OAuthDomainError("INVALID_RESPONSE", false, "OAuth state is invalid or expired");
    }
    const tokens = await this.client.redeemAuthorizationCode(code, decryptValue(flow.pkceVerifierCipher));
    const identity = await this.client.verifyIdentity(
      tokens.idToken,
      flow.nonceHash,
      flow.resource === "graph" ? tokens.accessToken : undefined,
    );
    if (
      (flow.expectedSubject && identity.subject !== flow.expectedSubject) ||
      (flow.expectedTenantId && identity.tenantId !== flow.expectedTenantId)
    ) {
      throw new OAuthDomainError("PERMISSION_DENIED", false, "The authorized Microsoft account does not match");
    }
    const existing = flow.accountId
      ? await this.accountRepository.findById(flow.accountId)
      : await this.accountRepository.findByIdentity(identity.issuer, identity.subject);
    const account = await this.accountRepository.saveIdentity({
      id: existing?.id,
      email: identity.email,
      normalizedEmail: identity.email.toLowerCase(),
      providerSubject: identity.subject,
      tenantId: identity.tenantId,
      issuer: identity.issuer,
      accountType: identity.accountType,
      status: existing?.status ?? "unknown",
      preferredProtocol: existing?.preferredProtocol ?? null,
      lastCheckedAt: existing?.lastCheckedAt ?? null,
      lastErrorCode: null,
    });
    const refresh = encryptValue(tokens.refreshToken);
    const access = encryptValue(tokens.accessToken);
    const clientId = env().MICROSOFT_CLIENT_ID as string;
    const now = new Date();
    const grant = await this.oauthRepository.upsertGrant({
      accountId: account.id,
      resource: flow.resource,
      source: "managed",
      clientId,
      tenantId: identity.tenantId,
      refreshTokenCipher: refresh.ciphertext,
      grantedScopes: tokens.scopes.length ? tokens.scopes : RESOURCE_SCOPES[flow.resource],
      keyId: refresh.keyId,
      lastVerifiedAt: now,
      nextMaintenanceAt: new Date(now.getTime() + MAINTENANCE_MS),
      providerExpiresAt: tokens.providerRefreshExpiresAt,
    });
    await this.oauthRepository.saveAccessToken({
      grantId: grant.id,
      profile: flow.resource === "graph" ? "graph_mail" : "imap_mail",
      tokenCipher: access.ciphertext,
      keyId: access.keyId,
      expiresAt: tokens.expiresAt,
    });
    return { account, resource: flow.resource };
  }
}
