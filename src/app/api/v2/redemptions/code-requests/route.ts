import { z } from "zod";
import { codeRequestService } from "@/modules/redemption/composition";
import { JobExecutionError } from "@/modules/jobs/domain/job-error";
import { consumeRateLimit } from "@/shared/rate-limit/postgres-rate-limit";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";
import { hmacValue } from "@/shared/crypto/hash";

const schema = z.object({ cardKey: z.string().min(8).max(128) });

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const { cardKey } = schema.parse(await request.json());
    const ip = request.headers.get("x-real-ip") ?? "unknown";
    const limited = await consumeRateLimit("redeem-code", `${ip}:${hmacValue(cardKey.toUpperCase())}`, 6, 60_000);
    if (!limited.allowed) {
      return apiFailure("RATE_LIMITED", "请求过于频繁，请稍后再试。", 429, {
        requestId,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      });
    }
    return apiSuccess(await codeRequestService.create(cardKey), { requestId, status: 202 });
  } catch (error) {
    if (error instanceof JobExecutionError && error.code === "CARD_KEY_INVALID") {
      return apiFailure(error.code, "卡密无效或不存在。", 404, { requestId });
    }
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "卡密格式不正确。", 422, { requestId });
    return apiFailure("CODE_REQUEST_FAILED", "暂时无法创建验证码请求。", 500, { requestId });
  }
}
