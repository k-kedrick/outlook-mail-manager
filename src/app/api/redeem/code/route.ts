import { fail, ok, routeError } from "@/lib/api";
import { fetchAndStoreCode } from "@/lib/outlook/code-service";
import { accountForCardKey } from "@/lib/redeem";
import { redeemSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

// Public: fetch the latest email verification code for the card key's account.
// Read-only path (fetchAndStoreCode reuses cached access tokens + the 5-min
// rotation guard) — it never force-refreshes / rotates the refresh token.
export async function POST(request: Request): Promise<Response> {
  try {
    const { code } = redeemSchema.parse(await request.json());
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
      const message = mailError instanceof Error ? mailError.message : String(mailError);
      return fail(message, 502);
    }
  } catch (error) {
    return routeError(error);
  }
}
