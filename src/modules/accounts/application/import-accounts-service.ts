import { parseImportedAccounts, type AccountImporter } from "../domain/import-account";

export type ImportAccountsResult = {
  requested: number;
  created: number;
  updated: number;
  duplicates: number;
  invalid: Array<{ line: number; reason: string }>;
  accounts: Array<{ id: string; email: string }>;
  failed: Array<{ line: number; email: string; reason: string }>;
};

export class ImportAccountsService {
  constructor(private readonly importer: AccountImporter) {}

  async execute(text: string, groupId?: string): Promise<ImportAccountsResult> {
    const parsed = parseImportedAccounts(text);
    const result: ImportAccountsResult = {
      requested: text.split(/\r?\n/).filter((line) => line.trim()).length,
      created: 0,
      updated: 0,
      duplicates: parsed.duplicates,
      invalid: parsed.invalid,
      accounts: [],
      failed: [],
    };
    for (const account of parsed.accounts) {
      try {
        const imported = await this.importer.import(account, groupId);
        if (imported.created) result.created += 1;
        else result.updated += 1;
        result.accounts.push({ id: imported.accountId, email: account.email });
      } catch {
        result.failed.push({ line: account.line, email: account.email, reason: "IMPORT_FAILED" });
      }
    }
    return result;
  }
}
