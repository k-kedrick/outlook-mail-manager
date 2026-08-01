import { z } from "zod";
import { cardKeyService } from "@/modules/redemption/composition";
import { decryptValue } from "@/shared/crypto/keyring";
import { hmacValue } from "@/shared/crypto/hash";
import { totpCode } from "@/shared/crypto/totp";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";
import { consumeRateLimit } from "@/shared/rate-limit/postgres-rate-limit";

const schema = z.object({ cardKey: z.string().min(8).max(128) });

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const { cardKey } = schema.parse(await request.json());
    const ip = request.headers.get("x-real-ip") ?? "unknown";
    const limited = await consumeRateLimit("redeem-totp", `${ip}:${hmacValue(cardKey.toUpperCase())}`, 10, 60_000);
    if (!limited.allowed) {
      return apiFailure("RATE_LIMITED", "请求过于频繁，请稍后再试。", 429, {
        requestId,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      });
    }
    const credential = await cardKeyService.resolve(cardKey);
    if (!credential) return apiFailure("CARD_KEY_INVALID", "卡密无效或不存在。", 404, { requestId });
    if (!credential.account.secret?.totpCipher) return apiSuccess({ totp: null }, { requestId });

    const period = 30;
    const now = Date.now();
    return apiSuccess(
      {
        totp: totpCode(decryptValue(credential.account.secret.totpCipher), now, period),
        secondsRemaining: period - (Math.floor(now / 1000) % period),
        period,
      },
      { requestId },
    );
  } catch (error) {
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "卡密格式不正确。", 422, { requestId });
    return apiFailure("TOTP_FAILED", "暂时无法生成动态验证码。", 500, { requestId });
  }
}
