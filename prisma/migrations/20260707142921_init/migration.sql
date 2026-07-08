-- CreateTable
CREATE TABLE "MailAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordCipher" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "refreshTokenCipher" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" DATETIME,
    "lastError" TEXT,
    "note" TEXT,
    "groupId" TEXT,
    "graphTokenCipher" TEXT,
    "graphTokenExpiresAt" DATETIME,
    "imapTokenCipher" TEXT,
    "imapTokenExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MailAccount_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MailGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MailGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "MailAccount_email_key" ON "MailAccount"("email");

-- CreateIndex
CREATE INDEX "MailAccount_status_idx" ON "MailAccount"("status");

-- CreateIndex
CREATE INDEX "MailAccount_groupId_idx" ON "MailAccount"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "MailGroup_name_key" ON "MailGroup"("name");
