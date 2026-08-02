import type { MailAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Resolve a card key to its bound account. Returns null when the code is unknown.
 * The card key is the sole credential for the public redemption flow.
 */
export async function accountForCardKey(code: string): Promise<MailAccount | null> {
  const key = await prisma.cardKey.findUnique({
    where: { code: code.trim() },
    include: { account: true },
  });
  return key?.account ?? null;
}
