import { describe, expect, it, vi } from "vitest";

const { update, imapInbox } = vi.hoisted(() => ({
  update: vi.fn(async () => ({})),
  imapInbox: vi.fn(async () => []),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { mailAccount: { update } } }));
vi.mock("./oauth", () => ({
  getAccessToken: vi.fn(async () => "token"),
  OAuthError: class OAuthError extends Error { code = "error"; },
}));
vi.mock("./imap", () => ({ imapInbox, imapMessage: vi.fn() }));

import { fetchInbox, protocolOrder } from "./mail";

describe("three-protocol mail routing", () => {
  it("uses the exact learned and unknown protocol orders", () => {
    expect(protocolOrder({ mailProtocol: null })).toEqual(["outlook", "graph", "imap"]);
    expect(protocolOrder({ mailProtocol: "outlook" })).toEqual(["outlook", "graph", "imap"]);
    expect(protocolOrder({ mailProtocol: "graph" })).toEqual(["graph", "outlook", "imap"]);
    expect(protocolOrder({ mailProtocol: "imap" })).toEqual(["imap", "outlook", "graph"]);
  });

  it("falls back to IMAP after both HTTPS APIs fail and persists the learned source", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    const account = { id: "a", mailProtocol: null } as never;
    const result = await fetchInbox(account);
    expect(result.source).toBe("imap");
    expect(imapInbox).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({ where: { id: "a" }, data: { mailProtocol: "imap" } });
  });
});
