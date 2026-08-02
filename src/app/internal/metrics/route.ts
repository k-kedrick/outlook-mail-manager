import { safeEqual } from "@/shared/crypto/hash";
import { env } from "@/shared/config/env";
import { metrics } from "@/shared/observability/metrics";

export async function GET(request: Request): Promise<Response> {
  const configured = env().METRICS_BEARER_TOKEN;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (process.env.NODE_ENV === "production" && (!configured || !safeEqual(configured, supplied))) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(await metrics.registry.metrics(), {
    headers: { "Content-Type": metrics.registry.contentType, "Cache-Control": "no-store" },
  });
}
