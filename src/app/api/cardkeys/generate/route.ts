import { Prisma } from "@prisma/client";
import { ok, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildCode } from "@/lib/cardkey";
import { cardKeyGenerateSchema } from "@/lib/validation";

export const runtime = "nodejs";

const MAX_COLLISION_RETRIES = 6;

/** Create a card key with a fresh code, retrying on the (rare) unique collision. */
async function createWithRetry(accountId: string, prefix: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt += 1) {
    try {
      await prisma.cardKey.create({ data: { accountId, code: buildCode(prefix) } });
      return;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < MAX_COLLISION_RETRIES - 1) {
        continue; // code collided — try another random suffix
      }
      throw err;
    }
  }
}

async function regenerateWithRetry(accountId: string, prefix: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt += 1) {
    try {
      await prisma.cardKey.update({ where: { accountId }, data: { code: buildCode(prefix) } });
      return;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && attempt < MAX_COLLISION_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }
}

// Generate one-to-one card keys for the given accounts. `regenerate` replaces
// existing keys; otherwise accounts that already have a key are skipped.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuth();
    const { ids, prefix, regenerate } = cardKeyGenerateSchema.parse(await request.json());

    const existing = await prisma.cardKey.findMany({
      where: { accountId: { in: ids } },
      select: { accountId: true },
    });
    const hasKey = new Set(existing.map((k) => k.accountId));

    let generated = 0;
    let regenerated = 0;
    let skipped = 0;

    for (const accountId of ids) {
      if (hasKey.has(accountId)) {
        if (regenerate) {
          await regenerateWithRetry(accountId, prefix);
          regenerated += 1;
        } else {
          skipped += 1;
        }
      } else {
        await createWithRetry(accountId, prefix);
        generated += 1;
      }
    }

    return ok({ generated, regenerated, skipped, total: ids.length });
  } catch (error) {
    return routeError(error);
  }
}
