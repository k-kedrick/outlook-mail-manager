import { fail, ok, routeError } from "@/lib/api";
import { accountForCardKey } from "@/lib/redeem";
import { redeemSchema } from "@/lib/validation";

export const runtime = "nodejs";

// Public: validate a card key and return the bound account's identity ONLY.
// Never exposes password / clientId / refreshToken.
export async function POST(request: Request): Promise<Response> {
  try {
    const { code } = redeemSchema.parse(await request.json());
    const account = await accountForCardKey(code);
    if (!account) return fail("卡密无效或不存在。", 404);

    return ok({ email: account.email, has2fa: Boolean(account.totpSecretCipher) });
  } catch (error) {
    return routeError(error);
  }
}
