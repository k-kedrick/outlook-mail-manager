import { fail, logPublicError, ok, rateLimited, requestId, routeError } from "@/lib/api";
import { accountForCardKey } from "@/lib/redeem";
import { decryptSecret } from "@/lib/secrets";
import { totpWithRemaining } from "@/lib/totp";
import { redeemSchema } from "@/lib/validation";
import { checkRateLimit, privateKey, requestIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Public: current authenticator (TOTP) code for the card key's account.
// Pure local compute — no network, no token use.
export async function POST(request: Request): Promise<Response> {
  const id = requestId();
  try {
    const { code } = redeemSchema.parse(await request.json());
    const limited = checkRateLimit("redeem-totp", `${requestIp(request)}:${privateKey(code)}`, 10, 60_000);
    if (!limited.allowed) return rateLimited(limited.retryAfter);
    const account = await accountForCardKey(code);
    if (!account) return fail("卡密无效或不存在。", 404);
    if (!account.totpSecretCipher) return ok({ totp: null });

    const secret = decryptSecret(account.totpSecretCipher);
    const { code: totp, secondsRemaining, period } = totpWithRemaining(secret);
    return ok({ totp, secondsRemaining, period });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") return routeError(error);
    logPublicError("redeem-totp", id, error);
    return fail(`暂时无法生成动态验证码。请求编号：${id}`, 500);
  }
}
