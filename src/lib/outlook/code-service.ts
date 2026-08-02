import type { MailAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findLatestCode } from "./codes";
import { fetchInbox, type MailMessage } from "./mail";
import { statusFromError } from "./oauth";

export type CodeFetchResult = {
  id: string;
  email: string;
  code: string | null;
  codeAt: string | null;
  subject: string | null;
  from: string | null;
  context: string | null;
  error: string | null;
};

const SCAN_PAGE_SIZE = 20;
const MAX_SCAN_PER_FOLDER = 50;

async function scanFolder(account: MailAccount, folder: "inbox" | "junk") {
  for (let offset = 0; offset < MAX_SCAN_PER_FOLDER; offset += SCAN_PAGE_SIZE) {
    const limit = Math.min(SCAN_PAGE_SIZE, MAX_SCAN_PER_FOLDER - offset);
    const page = await fetchInbox(account, { limit, offset, withBody: true, folder });
    const hit = findLatestCode(page.messages);
    if (hit) return hit;
    if (page.messages.length < limit) return null;
  }
  return null;
}

/** Scan INBOX and Junk concurrently, returning the newest verification code across both. Throws on INBOX read failure. */
export async function findLatestCodeAcrossFolders(
  account: MailAccount,
): Promise<{ message: MailMessage; code: string } | null> {
  const [inboxHit, junkHit] = await Promise.all([
    scanFolder(account, "inbox"),
    scanFolder(account, "junk").catch(() => null),
    // Junk folder may not exist / not accessible — ignore its failure.
  ]);

  if (!inboxHit && !junkHit) return null;
  if (inboxHit && !junkHit) return { message: inboxHit.message, code: inboxHit.candidate.code };
  if (!inboxHit && junkHit) return { message: junkHit.message, code: junkHit.candidate.code };

  const inboxTime = new Date(inboxHit!.message.receivedAt ?? 0).getTime();
  const junkTime = new Date(junkHit!.message.receivedAt ?? 0).getTime();
  return junkTime > inboxTime
    ? { message: junkHit!.message, code: junkHit!.candidate.code }
    : { message: inboxHit!.message, code: inboxHit!.candidate.code };
}

/** Fetch the latest code and cache it on the account. Throws on read/auth failure. */
export async function fetchAndStoreCode(account: MailAccount): Promise<CodeFetchResult> {
  const found = await findLatestCodeAcrossFolders(account);
  if (!found) {
    return emptyResult(account);
  }
  const codeAt = found.message.receivedAt ? new Date(found.message.receivedAt) : new Date();
  await prisma.mailAccount.update({
    where: { id: account.id },
    data: { lastCode: found.code, lastCodeAt: codeAt, lastCodeSubject: found.message.subject },
  });
  return {
    id: account.id,
    email: account.email,
    code: found.code,
    codeAt: codeAt.toISOString(),
    subject: found.message.subject,
    from: found.message.from,
    context: null,
    error: null,
  };
}

/** Bulk variant with bounded concurrency; records per-account errors and status. */
export async function fetchAndStoreCodes(
  accounts: MailAccount[],
  concurrency = 5,
): Promise<CodeFetchResult[]> {
  const results: CodeFetchResult[] = new Array(accounts.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < accounts.length) {
      const index = cursor++;
      const account = accounts[index];
      try {
        results[index] = await fetchAndStoreCode(account);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.mailAccount
          .update({
            where: { id: account.id },
            data: { status: statusFromError(err), lastError: message, lastCheckedAt: new Date() },
          })
          .catch(() => {});
        results[index] = { ...emptyResult(account), error: message };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, accounts.length) }, worker));
  return results;
}

function emptyResult(account: MailAccount): CodeFetchResult {
  return {
    id: account.id,
    email: account.email,
    code: null,
    codeAt: null,
    subject: null,
    from: null,
    context: null,
    error: null,
  };
}
