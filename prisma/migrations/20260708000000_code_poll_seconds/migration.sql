-- Rename AppConfig.codePollIntervalMinutes -> codePollIntervalSeconds (default 60).
-- SQLite table rebuild; preserves the existing config row.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "refreshEnabled" BOOLEAN NOT NULL DEFAULT true,
    "refreshIntervalDays" INTEGER NOT NULL DEFAULT 7,
    "codePollEnabled" BOOLEAN NOT NULL DEFAULT false,
    "codePollIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "lastCodePollAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppConfig" ("id", "refreshEnabled", "refreshIntervalDays", "codePollEnabled", "codePollIntervalSeconds", "lastCodePollAt", "updatedAt")
SELECT "id", "refreshEnabled", "refreshIntervalDays", "codePollEnabled", 60, "lastCodePollAt", "updatedAt" FROM "AppConfig";
DROP TABLE "AppConfig";
ALTER TABLE "new_AppConfig" RENAME TO "AppConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
