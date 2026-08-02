import { codeRequestService } from "@/modules/redemption/composition";
import { JobExecutionError } from "@/modules/jobs/domain/job-error";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = crypto.randomUUID();
  const retrievalToken = request.headers.get("x-code-request-token");
  if (!retrievalToken) return apiFailure("UNAUTHORIZED", "缺少验证码请求凭据。", 401, { requestId });
  try {
    const { id } = await context.params;
    return apiSuccess(await codeRequestService.status(id, retrievalToken), { requestId });
  } catch (error) {
    if (error instanceof JobExecutionError) {
      return apiFailure(error.code, "验证码请求不存在或已经失效。", 404, { requestId });
    }
    return apiFailure("CODE_REQUEST_FAILED", "暂时无法读取验证码状态。", 500, { requestId });
  }
}
