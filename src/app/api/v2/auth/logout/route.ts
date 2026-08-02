import { cookies } from "next/headers";
import { authService } from "@/modules/auth/composition";
import {
  clearV2SessionCookies,
  requireV2Admin,
  V2_SESSION_COOKIE,
} from "@/modules/auth/presentation/next-auth";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    await requireV2Admin(request, true);
    const store = await cookies();
    await authService.logout(store.get(V2_SESSION_COOKIE)?.value);
    const response = apiSuccess({ authenticated: false }, { requestId });
    clearV2SessionCookies(response);
    return response;
  } catch {
    return apiFailure("UNAUTHORIZED", "请重新登录。", 401, { requestId });
  }
}
