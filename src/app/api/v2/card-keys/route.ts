import { z } from "zod";
import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { cardKeyService } from "@/modules/redemption/composition";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

const schema = z.object({
  accountIds: z.array(z.string().cuid()).min(1).max(1000),
  prefix: z.string().max(20).optional(),
  regenerate: z.boolean().default(false),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request, true);
    const input = schema.parse(await request.json());
    return apiSuccess(await cardKeyService.generate(input), { requestId });
  } catch (error) {
    if (error instanceof z.ZodError) return apiFailure("INVALID_INPUT", "卡密参数不正确。", 422, { requestId });
    return apiFailure("CARD_KEY_GENERATION_FAILED", "卡密生成失败。", 500, { requestId });
  }
}
