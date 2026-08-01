-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('UNKNOWN', 'PERSONAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "MailProtocol" AS ENUM ('GRAPH', 'IMAP', 'OUTLOOK_REST_LEGACY');

-- CreateEnum
CREATE TYPE "OAuthResource" AS ENUM ('GRAPH', 'OUTLOOK_IMAP', 'OUTLOOK_REST_LEGACY', 'IMPORTED_MULTI_RESOURCE');

-- CreateEnum
CREATE TYPE "OAuthGrantSource" AS ENUM ('MANAGED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "OAuthGrantStatus" AS ENUM ('ACTIVE', 'REAUTH_REQUIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "AccessTokenProfile" AS ENUM ('GRAPH_MAIL', 'IMAP_MAIL', 'OUTLOOK_REST_LEGACY');

-- CreateEnum
CREATE TYPE "CapabilityState" AS ENUM ('UNKNOWN', 'AVAILABLE', 'DENIED', 'DISABLED', 'TEMPORARY_FAILURE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRY', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCEEDED', 'FAILED', 'DENIED');

-- CreateEnum
CREATE TYPE "CodeRequestStatus" AS ENUM ('PENDING', 'RUNNING', 'FOUND', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT 'admin',
    "passwordHash" TEXT NOT NULL,
    "totpSecretCipher" TEXT,
    "totpConfirmedAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "bootstrapComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "providerSubject" TEXT,
    "tenantId" TEXT,
    "issuer" TEXT,
    "accountType" "AccountType" NOT NULL DEFAULT 'UNKNOWN',
    "preferredProtocol" "MailProtocol",
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastError" TEXT,
    "note" TEXT,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSecret" (
    "accountId" TEXT NOT NULL,
    "passwordCipher" TEXT,
    "totpCipher" TEXT,
    "keyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountSecret_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "OAuthGrant" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "resource" "OAuthResource" NOT NULL,
    "source" "OAuthGrantSource" NOT NULL,
    "status" "OAuthGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "clientId" TEXT NOT NULL,
    "tenantId" TEXT,
    "refreshTokenCipher" TEXT NOT NULL,
    "grantedScopes" TEXT[],
    "keyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastRotatedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "nextMaintenanceAt" TIMESTAMP(3),
    "providerExpiresAt" TIMESTAMP(3),
    "refreshLeaseOwner" TEXT,
    "refreshLeaseExpiresAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessTokenCache" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "profile" "AccessTokenProfile" NOT NULL,
    "tokenCipher" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessTokenCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtocolCapability" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "protocol" "MailProtocol" NOT NULL,
    "state" "CapabilityState" NOT NULL DEFAULT 'UNKNOWN',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastProbedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "circuitOpenUntil" TIMESTAMP(3),
    "retryAfterAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProtocolCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthFlow" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "accountId" TEXT,
    "resource" "OAuthResource" NOT NULL,
    "stateHash" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "pkceVerifierCipher" TEXT NOT NULL,
    "expectedSubject" TEXT,
    "expectedTenantId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardKey" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codePrefix" TEXT,
    "codeLast4" TEXT,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "accountId" TEXT,
    "dedupeKey" TEXT,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAttempt" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "workerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "outcome" "JobStatus" NOT NULL,
    "errorCode" TEXT,

    CONSTRAINT "JobAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "outcome" "AuditOutcome" NOT NULL,
    "requestId" TEXT NOT NULL,
    "ipHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "workerId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "concurrency" INTEGER NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

-- CreateTable
CREATE TABLE "CodeRequest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "cardKeyId" TEXT,
    "retrievalTokenHash" TEXT NOT NULL,
    "status" "CodeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resultCodeCipher" TEXT,
    "resultKeyId" TEXT,
    "resultSubject" TEXT,
    "resultFrom" TEXT,
    "resultReceivedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_adminId_expiresAt_idx" ON "AdminSession"("adminId", "expiresAt");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCode_adminId_codeHash_key" ON "RecoveryCode"("adminId", "codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "MailAccount_email_key" ON "MailAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MailAccount_normalizedEmail_key" ON "MailAccount"("normalizedEmail");

-- CreateIndex
CREATE INDEX "MailAccount_status_idx" ON "MailAccount"("status");

-- CreateIndex
CREATE INDEX "MailAccount_groupId_idx" ON "MailAccount"("groupId");

-- CreateIndex
CREATE INDEX "MailAccount_tenantId_idx" ON "MailAccount"("tenantId");

-- CreateIndex
CREATE INDEX "MailAccount_preferredProtocol_idx" ON "MailAccount"("preferredProtocol");

-- CreateIndex
CREATE UNIQUE INDEX "MailAccount_issuer_providerSubject_key" ON "MailAccount"("issuer", "providerSubject");

-- CreateIndex
CREATE INDEX "OAuthGrant_status_nextMaintenanceAt_idx" ON "OAuthGrant"("status", "nextMaintenanceAt");

-- CreateIndex
CREATE INDEX "OAuthGrant_refreshLeaseExpiresAt_idx" ON "OAuthGrant"("refreshLeaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthGrant_accountId_resource_clientId_key" ON "OAuthGrant"("accountId", "resource", "clientId");

-- CreateIndex
CREATE INDEX "AccessTokenCache_expiresAt_idx" ON "AccessTokenCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccessTokenCache_grantId_profile_key" ON "AccessTokenCache"("grantId", "profile");

-- CreateIndex
CREATE INDEX "ProtocolCapability_state_circuitOpenUntil_idx" ON "ProtocolCapability"("state", "circuitOpenUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolCapability_accountId_protocol_key" ON "ProtocolCapability"("accountId", "protocol");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthFlow_stateHash_key" ON "OAuthFlow"("stateHash");

-- CreateIndex
CREATE INDEX "OAuthFlow_expiresAt_idx" ON "OAuthFlow"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CardKey_codeHash_key" ON "CardKey"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "CardKey_accountId_key" ON "CardKey"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "MailGroup_name_key" ON "MailGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_priority_idx" ON "Job"("status", "runAt", "priority");

-- CreateIndex
CREATE INDEX "Job_leaseExpiresAt_idx" ON "Job"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "Job_accountId_status_idx" ON "Job"("accountId", "status");

-- CreateIndex
CREATE INDEX "JobAttempt_startedAt_idx" ON "JobAttempt"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobAttempt_jobId_attempt_key" ON "JobAttempt"("jobId", "attempt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_adminId_createdAt_idx" ON "AuditEvent"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_requestId_idx" ON "AuditEvent"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CodeRequest_retrievalTokenHash_key" ON "CodeRequest"("retrievalTokenHash");

-- CreateIndex
CREATE INDEX "CodeRequest_status_expiresAt_idx" ON "CodeRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CodeRequest_accountId_createdAt_idx" ON "CodeRequest"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_keyHash_windowStart_key" ON "RateLimitBucket"("keyHash", "windowStart");

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAccount" ADD CONSTRAINT "MailAccount_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MailGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSecret" ADD CONSTRAINT "AccountSecret_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthGrant" ADD CONSTRAINT "OAuthGrant_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessTokenCache" ADD CONSTRAINT "AccessTokenCache_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "OAuthGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocolCapability" ADD CONSTRAINT "ProtocolCapability_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthFlow" ADD CONSTRAINT "OAuthFlow_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardKey" ADD CONSTRAINT "CardKey_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAttempt" ADD CONSTRAINT "JobAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRequest" ADD CONSTRAINT "CodeRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRequest" ADD CONSTRAINT "CodeRequest_cardKeyId_fkey" FOREIGN KEY ("cardKeyId") REFERENCES "CardKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
