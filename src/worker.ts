import { initializeTelemetry, shutdownTelemetry } from "@/shared/observability/telemetry";

async function main(): Promise<void> {
  await initializeTelemetry("outlook-mail-manager-worker");

  const [
    { JobHandlers },
    { WorkerRuntime },
    { jobRepository },
    { enqueueScheduledJobs },
    { mailRouter },
    { tokenBroker },
    { codeRequestService },
    { logger },
  ] = await Promise.all([
    import("@/modules/jobs/application/job-handlers"),
    import("@/modules/jobs/application/worker-runtime"),
    import("@/modules/jobs/composition"),
    import("@/modules/jobs/infrastructure/postgres-job-scheduler"),
    import("@/modules/mail/composition"),
    import("@/modules/oauth/composition"),
    import("@/modules/redemption/composition"),
    import("@/shared/logging/logger"),
  ]);

  const handlers = new JobHandlers(jobRepository, mailRouter, tokenBroker, codeRequestService);
  const runtime = new WorkerRuntime(jobRepository, handlers, () => enqueueScheduledJobs(jobRepository));

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => runtime.stop());
  }

  try {
    await runtime.run();
  } catch (error: unknown) {
    logger({ component: "worker" }).fatal(
      { errorType: error instanceof Error ? error.name : typeof error },
      "worker terminated unexpectedly",
    );
    process.exitCode = 1;
  } finally {
    await shutdownTelemetry().catch(() => undefined);
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({
    level: "fatal",
    component: "worker-bootstrap",
    errorType: error instanceof Error ? error.name : typeof error,
  })}\n`);
  process.exitCode = 1;
});
