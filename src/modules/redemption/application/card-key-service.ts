import { randomInt } from "node:crypto";
import { hmacValue } from "@/shared/crypto/hash";
import type { CardKeyRepository } from "../domain/redemption";
import { CardKeyCollisionError } from "../domain/redemption";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function suffix(length = 12): string {
  let value = "";
  for (let index = 0; index < length; index += 1) value += ALPHABET[randomInt(ALPHABET.length)];
  return value;
}

function normalize(value: string): string { return value.trim().toUpperCase(); }

export class CardKeyService {
  constructor(private readonly repository: CardKeyRepository) {}

  async generate(input: { accountIds: string[]; prefix?: string; regenerate?: boolean }): Promise<{
    generated: Array<{ accountId: string; code: string }>;
    skipped: string[];
    missing: string[];
    failed: Array<{ accountId: string; email: string; reasonCode: "PERSISTENCE_ERROR" }>;
  }> {
    const prefix = normalize(input.prefix ?? "").replace(/[^A-Z0-9_-]/g, "").slice(0, 12);
    const accounts = await this.repository.findAccounts(input.accountIds);
    const found = new Set(accounts.map((account) => account.id));
    const result = {
      generated: [] as Array<{ accountId: string; code: string }>,
      skipped: [] as string[],
      missing: input.accountIds.filter((id) => !found.has(id)),
      failed: [] as Array<{ accountId: string; email: string; reasonCode: "PERSISTENCE_ERROR" }>,
    };
    for (const account of accounts) {
      if (account.hasCardKey && !input.regenerate) { result.skipped.push(account.id); continue; }
      try { result.generated.push({ accountId: account.id, code: await this.persist(account.id, prefix) }); }
      catch { result.failed.push({ accountId: account.id, email: account.email, reasonCode: "PERSISTENCE_ERROR" }); }
    }
    return result;
  }

  resolve(code: string) { return this.repository.findByHash(hmacValue(normalize(code))); }

  private async persist(accountId: string, prefix: string): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = prefix ? `${prefix}-${suffix()}` : suffix();
      try {
        await this.repository.save({ accountId, codeHash: hmacValue(normalize(code)), codePrefix: prefix || null, codeLast4: code.slice(-4) });
        return code;
      } catch (error) {
        if (!(error instanceof CardKeyCollisionError) || attempt === 5) throw error;
      }
    }
    throw new Error("Unable to allocate a unique card key");
  }
}
