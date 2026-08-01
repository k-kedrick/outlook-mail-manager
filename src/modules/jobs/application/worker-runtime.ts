import { randomUUID } from "node:crypto";
import { env } from "@/shared/config/env";
import { logger } from "@/shared/logging/logger";
import { metrics } from "@/shared/observability/metrics";
import type { ClaimedJob, JobRepository } from "../domain/job";
import { JobExecutionError } from "../domain/job-error";
import { JobHandlers } from "./job-handlers";

const VERSION = "2.0.0";

export class WorkerRuntime {
  private readonly workerId = env().WORKER_ID ?? `worker-${randomUUID()}`;
  private stopping = false;
  private active = 0;
  private lastScheduleAt = 0;
  private lastHeartbeatAt = 0;

  constructor(
    private readonly repository: JobRepository,
    private readonly handlers: JobHandlers,
    private readonly schedule: () => Promise<void>,
  ) {}

  async run(): Promise<void> {
    const log = logger({ component: "worker", workerId: this.workerId });
    log.info({ concurrency: env().WORKER_CONCURRENCY }, "worker started");
    while (!this.stopping) {
      const now = Date.now();
      if (now - this.lastHeartbeatAt >= 15_000) {
        await this.repository.heartbeat(this.workerId, VERSION, env().WORKER_CONCURRENCY);
        this.lastHeartbeatAt = now;
      }
      if (now - this.lastScheduleAt >= 60_000) {
        await this.schedule();
        this.lastScheduleAt = now;
      }
      while (!this.stopping && this.active < env().WORKER_CONCURRENCY) {
        const job = await this.repository.claim(this.workerId);
        if (!job) break;
        this.active += 1;
        void this.execute(job).finally(() => {
          this.active -= 1;
        });
      }
      if (!this.stopping) {
        await new Promise((resolve) => setTimeout(resolve, env().WORKER_POLL_INTERVAL_MS));
      }
    }
    while (this.active > 0) await new Promise((resolve) => setTimeout(resolve, 100));
    log.info("worker stopped");
  }

  stop(): void {
    this.stopping = true;
  }

  private async execute(job: ClaimedJob): Promise<void> {
    const log = logger({ component: "worker", workerId: this.workerId, jobId: job.id, jobType: job.type });
    const renewal = setInterval(() => {
      void this.repository.renewLease(job.id, this.workerId).catch(() => undefined);
    }, 20_000);
    const startedAt = Date.now();
    try {
      const result = await this.handlers.execute(job);
      await this.repository.succeed(job, result);
      metrics.jobs.inc({ type: job.type, outcome: "succeeded" });
      log.info({ durationMs: Date.now() - startedAt }, "job succeeded");
    } catch (error) {
      const jobError = error instanceof JobExecutionError
        ? error
        : new JobExecutionError("UNEXPECTED_JOB_ERROR", true, "Unexpected job failure");
      const status = await this.repository.fail(job, jobError.code, jobError.retryable, jobError.retryAfterMs);
      metrics.jobs.inc({ type: job.type, outcome: status.toLowerCase() });
      log.warn({ durationMs: Date.now() - startedAt, errorCode: jobError.code, status }, "job failed");
    } finally {
      clearInterval(renewal);
    }
  }
}
