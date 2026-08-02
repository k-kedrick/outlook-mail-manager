// Standalone keep-alive runner for Windows Task Scheduler / cron.
// Renews (rotates) refresh tokens that are due per the configured interval so
// their validity keeps sliding forward. Runs without the dev server.
//
//   npm run keep-alive          # only accounts due per AppConfig.refreshIntervalDays
//   npx tsx scripts/keep-alive.ts --all   # force-refresh every account
import "dotenv/config";
import { runKeepAlive } from "../src/lib/outlook/keep-alive";
import { getConfig } from "../src/lib/settings";

async function main(): Promise<void> {
  const all = process.argv.includes("--all");
  const cfg = await getConfig();
  const start = Date.now();
  console.log(
    `[keep-alive] start ${new Date().toISOString()} ` +
      `(${all ? "all accounts" : `stale > ${cfg.refreshIntervalDays}d`})`,
  );
  const res = await runKeepAlive(all ? {} : { staleBeforeDays: cfg.refreshIntervalDays });
  const secs = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[keep-alive] done in ${secs}s — checked ${res.checked}`, res.summary);
  process.exit(0);
}

main().catch((err) => {
  console.error("[keep-alive] fatal:", err);
  process.exit(1);
});
