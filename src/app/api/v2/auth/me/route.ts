import { requireV2Admin } from "@/modules/auth/presentation/next-auth";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireV2Admin(request);
    return apiSuccess({ id: session.adminId, username: session.username }, { requestId });
  } catch {
    return apiFailure("UNAUTHORIZED", "请重新登录。", 401, { requestId });
  }
}
