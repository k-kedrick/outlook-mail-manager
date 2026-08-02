import { fail, logPublicError, ok, rateLimited, requestId, routeError } from "@/lib/api";
import { fetchAndStoreCode } from "@/lib/outlook/code-service";
import { accountForCardKey } from "@/lib/redeem";
import { redeemSchema } from "@/lib/validation";
import { checkRateLimit, privateKey, requestIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Public: fetch the latest email verification code for the card key's account.
// Read-only path (fetchAndStoreCode reuses cached access tokens + the 5-min
// rotation guard) — it never force-refreshes / rotates the refresh token.
export async function POST(request: Request): Promise<Response> {
  const id = requestId();
  try {
    const { code } = redeemSchema.parse(await request.json());
    const limited = checkRateLimit("redeem-code", `${requestIp(request)}:${privateKey(code)}`, 6, 60_000);
    if (!limited.allowed) return rateLimited(limited.retryAfter);
    const account = await accountForCardKey(code);
    if (!account) return fail("卡密无效或不存在。", 404);

    try {
      const result = await fetchAndStoreCode(account);
      return ok({
        code: result.code,
        codeAt: result.codeAt,
        subject: result.subject,
        from: result.from,
      });
    } catch (mailError) {
      logPublicError("redeem-code", id, mailError);
      return fail(`暂时无法读取验证码。请求编号：${id}`, 502);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") return routeError(error);
    logPublicError("redeem-code", id, error);
    return fail(`暂时无法读取验证码。请求编号：${id}`, 500);
  }
}
