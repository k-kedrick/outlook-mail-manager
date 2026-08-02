export type JobStatus = "pending" | "running" | "retry" | "succeeded" | "failed" | "cancelled";

export const JOB_TYPES = {
  ACCOUNT_HEALTH: "account.health",
  CAPABILITY_PROBE: "account.capability-probe",
  CODE_WATCH: "mail.code-watch",
  TOKEN_MAINTENANCE: "oauth.token-maintenance",
  RETENTION_CLEANUP: "system.retention-cleanup",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export type ClaimedJob = {
  id: string;
  type: JobType;
  accountId: string | null;
  payload: unknown;
  attempt: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
};

export type JobRecord = {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  result: unknown;
  lastErrorCode: string | null;
  runAt: Date;
  completedAt: Date | null;
};

export interface JobRepository {
  enqueue(input: {
    type: JobType;
    payload: unknown;
    accountId?: string;
    dedupeKey?: string;
    runAt?: Date;
    priority?: number;
    maxAttempts?: number;
  }): Promise<JobRecord>;
  claim(workerId: string, leaseMs?: number): Promise<ClaimedJob | null>;
  renewLease(jobId: string, workerId: string, leaseMs?: number): Promise<boolean>;
  succeed(job: ClaimedJob, result: unknown): Promise<void>;
  fail(job: ClaimedJob, errorCode: string, retryable: boolean, retryAfterMs?: number): Promise<string>;
  find(id: string): Promise<JobRecord | null>;
  heartbeat(workerId: string, version: string, concurrency: number): Promise<void>;
  cleanup(now?: Date): Promise<void>;
}
