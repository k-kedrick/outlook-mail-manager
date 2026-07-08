import { fail, ok, routeError } from "@/lib/api";
import { accountForCardKey } from "@/lib/redeem";
import { decryptSecret } from "@/lib/secrets";
import { totpWithRemaining } from "@/lib/totp";
import { redeemSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Public: current authenticator (TOTP) code for the card key's account.
// Pure local compute — no network, no token use.
export async function POST(request: Request): Promise<Response> {
  try {
    const { code } = redeemSchema.parse(await request.json());
    const account = await accountForCardKey(code);
    if (!account) return fail("卡密无效或不存在。", 404);
    if (!account.totpSecretCipher) return ok({ totp: null });

    const secret = decryptSecret(account.totpSecretCipher);
    const { code: totp, secondsRemaining, period } = totpWithRemaining(secret);
    return ok({ totp, secondsRemaining, period });
  } catch (error) {
    return routeError(error);
  }
}
