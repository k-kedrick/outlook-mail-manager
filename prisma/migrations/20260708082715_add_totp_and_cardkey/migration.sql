-- AlterTable
ALTER TABLE "MailAccount" ADD COLUMN "totpSecretCipher" TEXT;

-- CreateTable
CREATE TABLE "CardKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CardKey_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CardKey_code_key" ON "CardKey"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CardKey_accountId_key" ON "CardKey"("accountId");
