import type { MailRoutingService } from "@/modules/mail/domain/mail-provider";
import type { AccessTokenProfile, TokenAccessBroker } from "@/modules/oauth/domain/oauth";
import { OAuthDomainError } from "@/modules/oauth/domain/oauth";
import type { CodeWatchExecutor } from "@/modules/redemption/domain/code-extractor";
import type { ClaimedJob, JobRepository } from "../domain/job";
import { JOB_TYPES } from "../domain/job";
import { JobExecutionError } from "../domain/job-error";

type MaintenancePayload = { profile?: AccessTokenProfile };

export class JobHandlers {
  constructor(
    private readonly jobs: JobRepository,
    private readonly mail: MailRoutingService,
    private readonly tokens: TokenAccessBroker,
    private readonly codeWatchExecutor: CodeWatchExecutor,
  ) {}

  async execute(job: ClaimedJob): Promise<unknown> {
    switch (job.type) {
      case JOB_TYPES.ACCOUNT_HEALTH:
        if (!job.accountId) throw new JobExecutionError("ACCOUNT_REQUIRED", false, "Account job is missing accountId");
        return { health: await this.mail.health(job.accountId) };
      case JOB_TYPES.CAPABILITY_PROBE:
        if (!job.accountId) throw new JobExecutionError("ACCOUNT_REQUIRED", false, "Account job is missing accountId");
        return { capabilities: await this.mail.probe(job.accountId) };
      case JOB_TYPES.TOKEN_MAINTENANCE:
        return this.tokenMaintenance(job);
      case JOB_TYPES.CODE_WATCH:
        return this.codeWatch(job);
      case JOB_TYPES.RETENTION_CLEANUP:
        await this.jobs.cleanup();
        return { cleaned: true };
      default:
        throw new JobExecutionError("UNKNOWN_JOB_TYPE", false, `Unsupported job type ${job.type}`);
    }
  }

  private async codeWatch(job: ClaimedJob): Promise<unknown> {
    const payload = job.payload as { codeRequestId?: string };
    if (!payload.codeRequestId) throw new JobExecutionError("CODE_REQUEST_REQUIRED", false, "Missing code request ID");
    return this.codeWatchExecutor.execute(payload.codeRequestId);
  }

  private async tokenMaintenance(job: ClaimedJob): Promise<unknown> {
    if (!job.accountId) throw new JobExecutionError("ACCOUNT_REQUIRED", false, "Token job is missing accountId");
    const payload = job.payload as MaintenancePayload;
    const profile = payload.profile ?? "graph_mail";
    try {
      await this.tokens.getAccessToken(job.accountId, profile, { forceMaintenance: true });
      return { refreshed: true, profile };
    } catch (error) {
      if (error instanceof OAuthDomainError) {
        throw new JobExecutionError(error.code, error.retryable, error.message, error.retryAfterMs);
      }
      throw new JobExecutionError("TOKEN_MAINTENANCE_FAILED", true, "Token maintenance failed");
    }
  }
}
