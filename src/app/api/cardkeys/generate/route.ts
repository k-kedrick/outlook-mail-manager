import { Prisma } from "@prisma/client";
import { logPublicError, ok, requestId, routeError } from "@/lib/api";
import { requireAuth } from "@/lib/auth";
import { buildBatchFeedback, missingIdIssues, safeIssueForError, type BatchIssue } from "@/lib/batch-feedback";
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
    const id = requestId();
    const accounts = await prisma.mailAccount.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, cardKey: { select: { id: true } } },
    });

    let generated = 0;
    let regenerated = 0;
    let skipped = 0;
    const issues: BatchIssue[] = missingIdIssues(ids, accounts.map((account) => account.id));

    for (const account of accounts) {
      if (account.cardKey) {
        if (regenerate) {
          try {
            await regenerateWithRetry(account.id, prefix);
            regenerated += 1;
          } catch (error) {
            logPublicError("cardkey-generate", id, error, "PROCESSING_ERROR", account.id);
            issues.push(safeIssueForError(account.id, account.email));
          }
        } else {
          skipped += 1;
          issues.push({
            id: account.id,
            email: account.email,
            outcome: "skipped",
            reasonCode: "CARD_KEY_EXISTS",
            message: "账号已有卡密，未启用覆盖。",
          });
        }
      } else {
        try {
          await createWithRetry(account.id, prefix);
          generated += 1;
        } catch (error) {
          logPublicError("cardkey-generate", id, error, "PROCESSING_ERROR", account.id);
          issues.push(safeIssueForError(account.id, account.email));
        }
      }
    }

    return ok({
      generated,
      regenerated,
      skipped,
      total: ids.length,
      feedback: buildBatchFeedback({
        requestId: id,
        requested: ids.length,
        succeeded: generated + regenerated,
        issues,
      }),
    });
  } catch (error) {
    return routeError(error);
  }
}
