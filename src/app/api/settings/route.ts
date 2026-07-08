import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { getConfig, updateConfig } from "@/lib/settings";
import { settingsSchema } from "@/lib/validation";

export async function GET(): Promise<Response> {
  try {
    await requireAuth();
    // Never expose the admin password hash to the client.
    const { adminPasswordHash: _omit, ...config } = await getConfig();
    return ok({ config });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const input = settingsSchema.parse(await request.json());
    const { adminPasswordHash: _omit, ...config } = await updateConfig(input);
    return ok({ config });
  } catch (error) {
    return routeError(error);
  }
}
