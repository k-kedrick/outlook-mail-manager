-- AlterTable
ALTER TABLE "MailAccount" ADD COLUMN "refreshTokenExpiresAt" DATETIME;
ALTER TABLE "MailAccount" ADD COLUMN "refreshTokenUpdatedAt" DATETIME;
