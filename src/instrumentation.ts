// Runs once on server startup (Next.js instrumentation). Starts the in-process
// keep-alive scheduler. The Node-only work sits inside the `=== "nodejs"` block
// so webpack strips the dynamic import (and its prisma/crypto/imapflow chain)
// from the Edge bundle used by middleware.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.KEEP_ALIVE_ENABLED !== "0") {
      const { startKeepAliveScheduler } = await import("@/lib/outlook/scheduler");
      startKeepAliveScheduler();
    }
  }
}
