// V2 background work runs in the dedicated worker process. The web process only
// validates production configuration during boot and never owns recurring timers.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      const { env } = await import("@/shared/config/env");
      env();
      const { initializeTelemetry } = await import("@/shared/observability/telemetry");
      await initializeTelemetry("outlook-mail-manager-web");
    }
  }
}
