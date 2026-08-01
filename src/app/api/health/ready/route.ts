import { readReadinessState } from "@/shared/database/readiness-repository";
import { apiFailure, apiSuccess } from "@/shared/http/api-response";

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const readiness = await readReadinessState();
    if (!readiness.worker) {
      return apiFailure("WORKER_NOT_READY", "后台任务服务尚未就绪。", 503, { requestId });
    }
    return apiSuccess({ status: "ok", database: "ok", worker: "ok" }, { requestId });
  } catch {
    return apiFailure("DATABASE_NOT_READY", "数据库尚未就绪。", 503, { requestId });
  }
}
