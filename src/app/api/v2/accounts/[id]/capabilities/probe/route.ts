import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { jobRepository } from "@/modules/jobs/composition";
import { JOB_TYPES } from "@/modules/jobs/domain/job";
import { sha256 } from "@/shared/crypto/hash";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request, true);
    const { id } = await context.params;
    const idempotencyKey = request.headers.get("idempotency-key");
    const job = await jobRepository.enqueue({
      type: JOB_TYPES.CAPABILITY_PROBE,
      accountId: id,
      payload: {},
      dedupeKey: idempotencyKey ? `probe:${id}:${sha256(idempotencyKey)}` : undefined,
      priority: 10,
    });
    return apiSuccess({ jobId: job.id, status: job.status.toLowerCase() }, { requestId, status: 202 });
  } catch {
    return apiFailure("CAPABILITY_PROBE_FAILED", "无法检测协议能力。", 502, { requestId });
  }
}
