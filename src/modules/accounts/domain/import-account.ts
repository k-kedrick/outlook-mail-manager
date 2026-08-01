export type ImportedAccountInput = {
  line: number;
  email: string;
  password?: string;
  clientId: string;
  refreshToken: string;
  totp?: string;
};

export type InvalidImportedAccount = { line: number; reason: string };

export interface AccountImporter {
  import(input: ImportedAccountInput, groupId?: string): Promise<{ accountId: string; created: boolean }>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseImportedAccounts(text: string): {
  accounts: ImportedAccountInput[];
  invalid: InvalidImportedAccount[];
  duplicates: number;
} {
  const accounts: ImportedAccountInput[] = [];
  const invalid: InvalidImportedAccount[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = index + 1;
    if (!raw.trim()) continue;
    const parts = raw.split("----").map((part) => part.trim());
    let email: string;
    let password: string | undefined;
    let clientId: string;
    let refreshToken: string;
    let totp: string | undefined;
    if (parts.length === 3) {
      [email, clientId, refreshToken] = parts;
    } else if (parts.length === 4 || parts.length === 5) {
      [email, password, clientId, refreshToken, totp] = parts;
      password ||= undefined;
      totp ||= undefined;
    } else {
      invalid.push({ line, reason: "INVALID_SEGMENT_COUNT" });
      continue;
    }
    const normalized = email.toLowerCase();
    if (!EMAIL.test(normalized) || !CLIENT_ID.test(clientId) || refreshToken.length < 20) {
      invalid.push({ line, reason: "INVALID_CREDENTIAL_FORMAT" });
      continue;
    }
    if (seen.has(normalized)) {
      duplicates += 1;
      continue;
    }
    seen.add(normalized);
    accounts.push({ line, email, password, clientId, refreshToken, totp });
  }
  return { accounts, invalid, duplicates };
}
