-- Add independent status-check config (separate from token refresh/keep-alive).
ALTER TABLE "AppConfig" ADD COLUMN "statusCheckEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AppConfig" ADD COLUMN "statusCheckIntervalMinutes" INTEGER NOT NULL DEFAULT 360;
ALTER TABLE "AppConfig" ADD COLUMN "lastStatusCheckAt" DATETIME;
