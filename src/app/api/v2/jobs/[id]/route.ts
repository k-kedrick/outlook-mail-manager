import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { jobRepository } from "@/modules/jobs/composition";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request);
    const { id } = await context.params;
    const job = await jobRepository.find(id);
    if (!job) return apiFailure("JOB_NOT_FOUND", "任务不存在。", 404, { requestId });
    return apiSuccess(
      {
        id: job.id,
        type: job.type,
        status: job.status.toLowerCase(),
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        result: job.result,
        lastErrorCode: job.lastErrorCode,
        runAt: job.runAt,
        completedAt: job.completedAt,
      },
      { requestId },
    );
  } catch {
    return apiFailure("UNAUTHORIZED", "请重新登录。", 401, { requestId });
  }
}
