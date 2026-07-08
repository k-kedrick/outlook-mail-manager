import { prisma } from "@/lib/prisma";
import { getConfig, markCodePollRan, markStatusCheckRan } from "@/lib/settings";
import { fetchAndStoreCodes } from "./code-service";
import { verifyStatuses } from "./health";
import { runKeepAlive } from "./keep-alive";

// Guard on globalThis so hot-reload / multiple imports don't stack timers.
const g = globalThis as unknown as { __schedulerStarted?: boolean; __lastTokenSweep?: number };

const TICK_MS = 10_000; // base cadence — small so second-granularity code polling works
const TOKEN_SWEEP_MS = 30 * 60_000; // token-refresh policy only needs checking occasionally

export function startKeepAliveScheduler(): void {
  if (g.__schedulerStarted) return;
  g.__schedulerStarted = true;

  const tick = async (): Promise<void> => {
    try {
      const cfg = await getConfig();

      // Token refresh (keep-alive): ROTATES tokens; only accounts stale > N days.
      // Checked at most every ~30 min (the N-day policy doesn't need finer granularity).
      if (cfg.refreshEnabled && Date.now() - (g.__lastTokenSweep ?? 0) >= TOKEN_SWEEP_MS) {
        g.__lastTokenSweep = Date.now();
        const res = await runKeepAlive({ staleBeforeDays: cfg.refreshIntervalDays });
        if (res.checked > 0) {
          console.log(`[scheduler] keep-alive refreshed ${res.checked} token(s)`, res.summary);
        }
      }

      // Status check: READ-ONLY probe, does NOT rotate tokens. Every N minutes.
      // Skips known-dead accounts to avoid repeated failed auth.
      if (cfg.statusCheckEnabled) {
        const due =
          !cfg.lastStatusCheckAt ||
          Date.now() - cfg.lastStatusCheckAt.getTime() >= cfg.statusCheckIntervalMinutes * 60_000;
        if (due) {
          const accounts = await prisma.mailAccount.findMany({
            where: { status: { not: "AUTH_FAILED" } },
          });
          if (accounts.length) {
            const results = await verifyStatuses(accounts, 5);
            const summary = results.reduce<Record<string, number>>((acc, r) => {
              const key = r.skipped ? "SKIPPED" : r.status;
              acc[key] = (acc[key] ?? 0) + 1;
              return acc;
            }, {});
            console.log(`[scheduler] status-checked ${results.length} account(s)`, summary);
          }
          await markStatusCheckRan();
        }
      }

      // Optional verification-code polling every N seconds.
      if (cfg.codePollEnabled) {
        const due =
          !cfg.lastCodePollAt ||
          Date.now() - cfg.lastCodePollAt.getTime() >= cfg.codePollIntervalSeconds * 1000;
        if (due) {
          const accounts = await prisma.mailAccount.findMany({ where: { status: "OK" } });
          if (accounts.length) {
            const results = await fetchAndStoreCodes(accounts, 5);
            const withCode = results.filter((r) => r.code).length;
            console.log(`[scheduler] polled codes: ${results.length} account(s), ${withCode} with code`);
          }
          await markCodePollRan();
        }
      }
    } catch (err) {
      console.error("[scheduler] tick failed:", err);
    }
  };

  const timer = setInterval(() => void tick(), TICK_MS);
  timer.unref?.();

  // Kick shortly after boot so already-due work runs without waiting a full tick.
  const kick = setTimeout(() => void tick(), 30_000);
  kick.unref?.();

  console.log(`[scheduler] started — base tick ${TICK_MS / 1000}s`);
}
