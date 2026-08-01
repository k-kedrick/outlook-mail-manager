import { apiSuccess } from "@/shared/http/api-response";

export async function GET(): Promise<Response> {
  return apiSuccess({ status: "ok", service: "web" });
}
