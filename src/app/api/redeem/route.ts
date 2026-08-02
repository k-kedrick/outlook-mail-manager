import { fail, logPublicError, ok, rateLimited, requestId, routeError } from "@/lib/api";
import { accountForCardKey } from "@/lib/redeem";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { redeemSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Public: validate a card key and return the bound account's identity ONLY.
// Never exposes password / clientId / refreshToken.
export async function POST(request: Request): Promise<Response> {
  const id = requestId();
  try {
    const limited = checkRateLimit("redeem", requestIp(request), 20, 60_000);
    if (!limited.allowed) return rateLimited(limited.retryAfter);
    const { code } = redeemSchema.parse(await request.json());
    const account = await accountForCardKey(code);
    if (!account) return fail("卡密无效或不存在。", 404);

    return ok({ email: account.email, has2fa: Boolean(account.totpSecretCipher) });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") return routeError(error);
    logPublicError("redeem", id, error);
    return fail(`暂时无法校验卡密。请求编号：${id}`, 500);
  }
}
