export type OAuthResource = "graph" | "outlook_imap" | "outlook_rest_legacy" | "imported_multi_resource";
export type OAuthGrantSource = "managed" | "imported";
export type OAuthGrantStatus = "active" | "reauth_required" | "revoked" | "error";
export type AccessTokenProfile = "graph_mail" | "imap_mail" | "outlook_rest_legacy";

export const RESOURCE_SCOPES: Record<"graph" | "outlook_imap", string[]> = {
  graph: [
    "openid",
    "profile",
    "email",
    "offline_access",
    "https://graph.microsoft.com/User.Read",
    "https://graph.microsoft.com/Mail.Read",
  ],
  outlook_imap: [
    "openid",
    "profile",
    "email",
    "offline_access",
    "https://outlook.office.com/IMAP.AccessAsUser.All",
  ],
};

export type OAuthGrant = {
  id: string;
  accountId: string;
  resource: OAuthResource;
  source: OAuthGrantSource;
  status: OAuthGrantStatus;
  clientId: string;
  tenantId: string | null;
  refreshTokenCipher: string;
  version: number;
  grantedScopes: string[];
  refreshLeaseOwner: string | null;
  refreshLeaseExpiresAt: Date | null;
};

export type AccessToken = {
  token: string;
  expiresAt: Date;
};

export type AuthorizationTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  providerRefreshExpiresAt?: Date;
  scopes: string[];
  idToken: string;
};

export type RefreshTokens = Omit<AuthorizationTokens, "idToken">;

export type OAuthIdentity = {
  subject: string;
  tenantId: string;
  issuer: string;
  email: string;
  accountType: "personal" | "organization";
};

export interface OAuthClient {
  authorizationUrl(input: {
    resource: "graph" | "outlook_imap";
    state: string;
    nonce: string;
    codeChallenge: string;
    loginHint?: string;
  }): string;
  redeemAuthorizationCode(code: string, verifier: string): Promise<AuthorizationTokens>;
  verifyIdentity(idToken: string, expectedNonceHash: string, graphAccessToken?: string): Promise<OAuthIdentity>;
  refresh(grant: OAuthGrant, profile: AccessTokenProfile, refreshToken: string): Promise<RefreshTokens>;
}

export interface TokenAccessBroker {
  getAccessToken(
    accountId: string,
    profile: AccessTokenProfile,
    options?: { forceMaintenance?: boolean },
  ): Promise<string>;
}

export type OAuthErrorCode =
  | "AUTH_REQUIRED"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "REFRESH_BUSY";

export class OAuthDomainError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    readonly retryable: boolean,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "OAuthDomainError";
  }
}

export type OAuthFlowRecord = {
  id: string;
  adminId: string;
  accountId: string | null;
  resource: OAuthResource;
  nonceHash: string;
  pkceVerifierCipher: string;
  expectedSubject: string | null;
  expectedTenantId: string | null;
  expiresAt: Date;
};

export type TokenCacheRecord = {
  tokenCipher: string;
  expiresAt: Date;
};

export interface OAuthRepository {
  createFlow(input: {
    adminId: string;
    accountId?: string;
    resource: OAuthResource;
    stateHash: string;
    nonceHash: string;
    pkceVerifierCipher: string;
    expectedSubject?: string;
    expectedTenantId?: string;
    expiresAt: Date;
  }): Promise<void>;
  consumeFlow(stateHash: string, now: Date): Promise<OAuthFlowRecord | null>;
  upsertGrant(input: {
    accountId: string;
    resource: OAuthResource;
    source: OAuthGrantSource;
    clientId: string;
    tenantId?: string;
    refreshTokenCipher: string;
    grantedScopes: string[];
    keyId: string;
    lastVerifiedAt: Date;
    nextMaintenanceAt: Date;
    providerExpiresAt?: Date;
  }): Promise<OAuthGrant>;
  saveAccessToken(input: {
    grantId: string;
    profile: AccessTokenProfile;
    tokenCipher: string;
    keyId: string;
    expiresAt: Date;
  }): Promise<void>;
  findGrant(accountId: string, profile: AccessTokenProfile): Promise<OAuthGrant | null>;
  findCachedToken(grantId: string, profile: AccessTokenProfile): Promise<TokenCacheRecord | null>;
  claimRefreshLease(grantId: string, owner: string, now: Date, expiresAt: Date): Promise<boolean>;
  releaseRefreshLease(grantId: string, owner: string, errorCode?: string): Promise<void>;
  markGrantStatus(grantId: string, status: OAuthGrantStatus, errorCode: string): Promise<void>;
  completeRefresh(input: {
    grantId: string;
    owner: string;
    expectedVersion: number;
    refreshTokenCipher?: string;
    refreshTokenKeyId?: string;
    profile: AccessTokenProfile;
    accessTokenCipher: string;
    accessTokenKeyId: string;
    accessTokenExpiresAt: Date;
    providerExpiresAt?: Date;
    nextMaintenanceAt: Date;
    rotatedAt: Date;
  }): Promise<boolean>;
}
