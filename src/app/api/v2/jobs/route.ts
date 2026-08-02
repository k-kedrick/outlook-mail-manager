import { z } from "zod";
import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { JOB_TYPES } from "@/modules/jobs/domain/job";
import { jobRepository } from "@/modules/jobs/composition";
import { sha256 } from "@/shared/crypto/hash";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";
import { toJsonValue } from "@/shared/database/json";

const inputSchema = z.object({
  type: z.enum([
    JOB_TYPES.ACCOUNT_HEALTH,
    JOB_TYPES.CAPABILITY_PROBE,
    JOB_TYPES.CODE_WATCH,
    JOB_TYPES.TOKEN_MAINTENANCE,
  ]),
  accountId: z.string().cuid(),
  payload: z.record(z.unknown()).default({}),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request, true);
    const input = inputSchema.parse(await request.json());
    const idempotencyKey = request.headers.get("idempotency-key");
    const job = await jobRepository.enqueue({
      type: input.type,
      accountId: input.accountId,
      payload: toJsonValue(input.payload),
      dedupeKey: idempotencyKey ? `manual:${sha256(idempotencyKey)}` : undefined,
      priority: 10,
    });
    return apiSuccess({ jobId: job.id, status: job.status.toLowerCase() }, { requestId, status: 202 });
  } catch (error) {
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "任务参数不正确。", 422, { requestId });
    return apiFailure("UNAUTHORIZED", "请重新登录。", 401, { requestId });
  }
}
