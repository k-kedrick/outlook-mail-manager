import type { MailAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAccessToken, isThrottleError, jitter, statusFromError } from "./oauth";

export type CheckResult = {
  id: string;
  email: string;
  status: "OK" | "AUTH_FAILED" | "LOCKED" | "ERROR";
  error: string | null;
  skipped?: boolean;
};

function currentStatus(account: MailAccount): CheckResult["status"] {
  return (account.status as CheckResult["status"]) ?? "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Status check — READ-ONLY, does NOT rotate the refresh token.
// Reuses the cached access token (only refreshes if the cache expired, which is
// then rate-limited by the backstop in oauth.ts). Safe to run frequently.
// ---------------------------------------------------------------------------

const OUTLOOK_PROBE =
  "https://outlook.office.com/api/v2.0/me/MailFolders/Inbox/messages?$top=1&$select=Id";
const GRAPH_PROBE = "https://graph.microsoft.com/v1.0/me";

export async function verifyStatus(account: MailAccount): Promise<CheckResult> {
  const useGraph = account.mailProtocol === "graph";
  try {
    // NO forceRefresh — reuse cached access token; no rotation on the happy path.
    const token = await getAccessToken(account, useGraph ? "graph" : "imap");
    const res = await fetch(useGraph ? GRAPH_PROBE : OUTLOOK_PROBE, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    let status: CheckResult["status"];
    let error: string | null = null;
    if (res.ok) {
      status = "OK";
    } else if (res.status === 401 || res.status === 403) {
      status = "LOCKED";
      error = `探测被拒绝 (${res.status})`;
    } else {
      status = "ERROR";
      error = `探测失败 (${res.status})`;
    }

    await prisma.mailAccount.update({
      where: { id: account.id },
      data: { status, lastError: error, lastCheckedAt: new Date() },
    });
    return { id: account.id, email: account.email, status, error };
  } catch (e) {
    if (isThrottleError(e)) {
      // Cache expired AND a refresh was rate-limited — keep the last-known status
      // rather than forcing a rotation. Nothing written.
      return {
        id: account.id,
        email: account.email,
        status: currentStatus(account),
        error: account.lastError,
        skipped: true,
      };
    }
    const status = statusFromError(e);
    const error = e instanceof Error ? e.message : String(e);
    await prisma.mailAccount.update({
      where: { id: account.id },
      data: { status, lastError: error, lastCheckedAt: new Date() },
    });
    return { id: account.id, email: account.email, status, error };
  }
}

/** Bulk status check with bounded concurrency + jitter. Skips known-dead accounts. */
export async function verifyStatuses(
  accounts: MailAccount[],
  concurrency = 5,
): Promise<CheckResult[]> {
  const results: CheckResult[] = new Array(accounts.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < accounts.length) {
      const index = cursor++;
      await jitter();
      try {
        results[index] = await verifyStatus(accounts[index]);
      } catch (error) {
        results[index] = {
          id: accounts[index].id,
          email: accounts[index].email,
          status: "ERROR",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, accounts.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Keep-alive check — force-refreshes (ROTATES) the refresh token. Use sparingly
// (every N days). Doubles as a status update.
// ---------------------------------------------------------------------------

export async function checkAccount(account: MailAccount): Promise<CheckResult> {
  let status: CheckResult["status"] = "OK";
  let error: string | null = null;
  let learned: "graph" | "outlook" | null = null;

  try {
    await getAccessToken(account, "graph", { forceRefresh: true });
    learned = "graph";
  } catch (graphError) {
    try {
      await getAccessToken(account, "imap", { forceRefresh: true });
      learned = "outlook";
    } catch (imapError) {
      // Rate-limited (rotated too recently) — skip without changing status.
      if (isThrottleError(imapError) || isThrottleError(graphError)) {
        return {
          id: account.id,
          email: account.email,
          status: currentStatus(account),
          error: account.lastError,
          skipped: true,
        };
      }
      status = statusFromError(imapError);
      error = imapError instanceof Error ? imapError.message : String(imapError);
    }
    void graphError;
  }

  await prisma.mailAccount.update({
    where: { id: account.id },
    data: {
      status,
      lastError: error,
      lastCheckedAt: new Date(),
      ...(learned ? { mailProtocol: learned } : {}),
    },
  });
  return { id: account.id, email: account.email, status, error };
}

/** Run keep-alive checks with bounded concurrency + jitter. */
export async function checkAccounts(
  accounts: MailAccount[],
  concurrency = 5,
): Promise<CheckResult[]> {
  const results: CheckResult[] = new Array(accounts.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < accounts.length) {
      const index = cursor++;
      await jitter();
      try {
        results[index] = await checkAccount(accounts[index]);
      } catch (error) {
        results[index] = {
          id: accounts[index].id,
          email: accounts[index].email,
          status: "ERROR",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, accounts.length) }, worker);
  await Promise.all(workers);
  return results;
}
