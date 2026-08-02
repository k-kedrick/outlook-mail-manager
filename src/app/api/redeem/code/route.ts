import { NextResponse } from "next/server";
import { z } from "zod";
import { mailRouter } from "@/modules/mail/composition";
import { cardKeyService } from "@/modules/redemption/composition";
import { extractVerificationCode } from "@/modules/redemption/domain/code-extractor";
import { hmacValue } from "@/shared/crypto/hash";
import { markLegacyApi } from "@/shared/http/legacy-deprecation";
import { consumeRateLimit } from "@/shared/rate-limit/postgres-rate-limit";

const schema = z.object({ code: z.string().min(8).max(128) });
const json = (body: unknown, status = 200): Response => markLegacyApi(NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }));

export async function POST(request: Request): Promise<Response> {
  try {
    const { code } = schema.parse(await request.json());
    const ip = request.headers.get("x-real-ip") ?? "unknown";
    const limited = await consumeRateLimit("legacy-redeem-code", `${ip}:${hmacValue(code.toUpperCase())}`, 6, 60_000);
    if (!limited.allowed) return markLegacyApi(NextResponse.json({ error: { message: "请求过于频繁。" } }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } }));
    const key = await cardKeyService.resolve(code);
    if (!key) return json({ error: { message: "卡密无效或不存在。" } }, 404);
    const hits: Array<{ code: string; codeAt: string | null; subject: string; from: string }> = [];
    for (const folder of ["inbox", "junk"] as const) {
      const page = await mailRouter.list({ accountId: key.accountId, folder, limit: 20 }).catch(() => null);
      for (const summary of page?.messages ?? []) {
        let message = summary;
        let value = extractVerificationCode(message);
        if (!value) {
          message = await mailRouter.getMessage({ accountId: key.accountId, folder, messageId: summary.id }).catch(() => summary);
          value = extractVerificationCode(message);
        }
        if (value) { hits.push({ code: value, codeAt: message.receivedAt, subject: message.subject, from: message.from }); break; }
      }
    }
    hits.sort((a, b) => new Date(b.codeAt ?? 0).getTime() - new Date(a.codeAt ?? 0).getTime());
    return json(hits[0] ?? { code: null, codeAt: null, subject: null, from: null });
  } catch (error) {
    return json({ error: { message: error instanceof z.ZodError ? "卡密格式不正确。" : "暂时无法读取验证码。" } }, error instanceof z.ZodError ? 422 : 502);
  }
}
