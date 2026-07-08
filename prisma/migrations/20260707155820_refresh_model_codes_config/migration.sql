-- AlterTable
ALTER TABLE "MailAccount" ADD COLUMN "lastCode" TEXT;
ALTER TABLE "MailAccount" ADD COLUMN "lastCodeAt" DATETIME;
ALTER TABLE "MailAccount" ADD COLUMN "lastCodeSubject" TEXT;
ALTER TABLE "MailAccount" ADD COLUMN "mailProtocol" TEXT;

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "refreshEnabled" BOOLEAN NOT NULL DEFAULT true,
    "refreshIntervalDays" INTEGER NOT NULL DEFAULT 7,
    "codePollEnabled" BOOLEAN NOT NULL DEFAULT false,
    "codePollIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
    "lastCodePollAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
