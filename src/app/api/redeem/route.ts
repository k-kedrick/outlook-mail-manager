import { NextResponse } from "next/server";
import { z } from "zod";
import { cardKeyService } from "@/modules/redemption/composition";
import { hmacValue } from "@/shared/crypto/hash";
import { markLegacyApi } from "@/shared/http/legacy-deprecation";
import { consumeRateLimit } from "@/shared/rate-limit/postgres-rate-limit";

const schema = z.object({ code: z.string().min(8).max(128) });
const json = (body: unknown, status = 200): Response => markLegacyApi(NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }));

export async function POST(request: Request): Promise<Response> {
  try {
    const { code } = schema.parse(await request.json());
    const ip = request.headers.get("x-real-ip") ?? "unknown";
    const limited = await consumeRateLimit("legacy-redeem", `${ip}:${hmacValue(code.toUpperCase())}`, 20, 60_000);
    if (!limited.allowed) return markLegacyApi(NextResponse.json({ error: { message: "请求过于频繁。" } }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }));
    const key = await cardKeyService.resolve(code);
    if (!key) return json({ error: { message: "卡密无效或不存在。" } }, 404);
    return json({ email: key.account.email, has2fa: Boolean(key.account.secret?.totpCipher) });
  } catch (error) {
    return json({ error: { message: error instanceof z.ZodError ? "卡密格式不正确。" : "暂时无法校验卡密。" } }, error instanceof z.ZodError ? 422 : 500);
  }
}
