import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { runKeepAlive } from "@/lib/outlook/keep-alive";
import { bulkIdsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

// Manually renew (rotate) refresh tokens. With ids → only those; without → all.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({}));

    let ids: string[] | undefined;
    if (body && Array.isArray(body.ids) && body.ids.length > 0) {
      ids = bulkIdsSchema.parse(body).ids;
    }

    const result = await runKeepAlive({ ids });
    return ok(result);
  } catch (error) {
    return routeError(error);
  }
}
