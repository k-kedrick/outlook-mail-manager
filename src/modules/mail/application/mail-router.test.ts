import { describe, expect, it, vi } from "vitest";
import type { MailProtocol, MailProvider } from "../domain/mail-provider";
import { encodeMailToken } from "../domain/opaque-token";
import { ProviderError } from "../domain/provider-error";
import { MailRouter } from "./mail-router";

function provider(protocol: MailProtocol, calls: string[], outcome: "ok" | "temporary" = "ok"): MailProvider {
  return {
    protocol,
    probe: vi.fn(async () => ({ available: true, latencyMs: 1 })),
    listMessages: vi.fn(async () => {
      calls.push(protocol);
      if (outcome === "temporary") throw new ProviderError("NETWORK_ERROR", true, "temporary");
      return { messages: [], nextCursor: null };
    }),
    getMessage: vi.fn(),
  };
}

function router(preferredProtocol: MailProtocol | null, capabilities: Array<{ protocol: MailProtocol; state: string; circuitOpenUntil?: Date | null; retryAfterAt?: Date | null }> = []) {
  const calls: string[] = [];
  const account = { id: "account-1", email: "one@example.com", preferredProtocol };
  const accounts = { findById: vi.fn(async () => account) } as any;
  const capabilityRepository = {
    list: vi.fn(async () => capabilities.map((item) => ({ ...item, consecutiveFailures: 0, circuitOpenUntil: item.circuitOpenUntil ?? null, retryAfterAt: item.retryAfterAt ?? null, lastSuccessAt: null }))),
    recordSuccess: vi.fn(async () => undefined),
    recordFailure: vi.fn(async () => undefined),
  } as any;
  const graph = provider("graph", calls, "temporary");
  const imap = provider("imap", calls);
  const legacy = provider("outlook_rest_legacy", calls);
  return {
    calls,
    accounts,
    capabilityRepository,
    providers: { graph, imap, legacy },
    value: new MailRouter([graph, imap, legacy], accounts, capabilityRepository, { getAccessToken: vi.fn() } as any),
  };
}

describe("mail provider routing", () => {
  it("falls back Graph to IMAP and excludes unproven legacy REST", async () => {
    const subject = router(null);
    await expect(subject.value.list({ accountId: "account-1", folder: "inbox", limit: 20 })).resolves.toMatchObject({ messages: [] });
    expect(subject.calls).toEqual(["graph", "imap"]);
  });

  it("honors a healthy preferred protocol", async () => {
    const subject = router("imap");
    await subject.value.list({ accountId: "account-1", folder: "junk", limit: 20 });
    expect(subject.calls).toEqual(["imap"]);
  });

  it("skips a permanently denied capability", async () => {
    const subject = router(null, [{ protocol: "graph", state: "denied" }]);
    await subject.value.list({ accountId: "account-1", folder: "inbox", limit: 20 });
    expect(subject.calls).toEqual(["imap"]);
  });

  it("binds an opaque cursor and message ID to the encoded provider", async () => {
    const subject = router(null);
    const cursor = encodeMailToken({
      version: 1,
      kind: "cursor",
      protocol: "imap",
      folder: "inbox",
      value: "uid-range",
      expiresAt: Date.now() + 60_000,
    });
    await subject.value.list({ accountId: "account-1", folder: "inbox", limit: 20, cursor });
    expect(subject.calls).toEqual(["imap"]);

    const messageId = encodeMailToken({
      version: 1,
      kind: "message",
      protocol: "graph",
      folder: "inbox",
      value: "message-1",
    });
    await subject.value.getMessage({ accountId: "account-1", folder: "inbox", messageId });
    expect(subject.providers.graph.getMessage).toHaveBeenCalledWith(expect.objectContaining({ messageId }));
  });

  it("skips an open circuit and permits proven legacy REST only when earlier providers fail", async () => {
    const subject = router(null, [
      { protocol: "graph", state: "temporary_failure", circuitOpenUntil: new Date(Date.now() + 60_000) },
      { protocol: "outlook_rest_legacy", state: "available" },
    ]);
    vi.mocked(subject.providers.imap.listMessages).mockRejectedValueOnce(new ProviderError("NETWORK_ERROR", true, "temporary"));
    await subject.value.list({ accountId: "account-1", folder: "junk", limit: 20 });
    expect(subject.calls).toEqual(["outlook_rest_legacy"]);
  });

  it("records normalized provider failures and probes each configured non-legacy capability", async () => {
    const subject = router(null);
    vi.mocked(subject.providers.graph.probe).mockRejectedValueOnce(new Error("raw provider response"));
    const result = await subject.value.probe("account-1");
    expect(result).toEqual([
      { protocol: "graph", available: false, errorCode: "PROVIDER_UNAVAILABLE" },
      { protocol: "imap", available: true },
    ]);
    expect(subject.capabilityRepository.recordFailure).toHaveBeenCalledWith(
      "account-1",
      "graph",
      expect.objectContaining({ code: "PROVIDER_UNAVAILABLE" }),
      expect.any(Date),
    );
  });

  it("uses one learned provider for the six-hour health check", async () => {
    const subject = router(null, [
      { protocol: "graph", state: "denied" },
      { protocol: "imap", state: "available" },
    ]);

    await expect(subject.value.health("account-1")).resolves.toEqual({ protocol: "imap", available: true });

    expect(subject.providers.graph.probe).not.toHaveBeenCalled();
    expect(subject.providers.imap.probe).toHaveBeenCalledOnce();
  });

  it("returns a fixed domain error for unknown accounts", async () => {
    const subject = router(null);
    subject.accounts.findById.mockResolvedValueOnce(null);
    await expect(subject.value.list({ accountId: "missing", folder: "inbox", limit: 20 }))
      .rejects.toMatchObject({ code: "MESSAGE_NOT_FOUND", retryable: false });
  });
});
