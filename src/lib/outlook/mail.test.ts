import { beforeEach, describe, expect, it, vi } from "vitest";

const { update } = vi.hoisted(() => ({ update: vi.fn(async () => ({})) }));
vi.mock("@/lib/prisma", () => ({ prisma: { mailAccount: { update } } }));
vi.mock("./oauth", () => ({
  getAccessToken: vi.fn(async () => "token"),
  OAuthError: class OAuthError extends Error {},
}));

import { fetchInboxAndJunk } from "./mail";

function restMessage(id: string, receivedAt: string) {
  return { Id: id, Subject: id, ReceivedDateTime: receivedAt };
}

describe("combined folder pagination", () => {
  beforeEach(() => {
    update.mockClear();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const value = url.includes("JunkEmail")
        ? [restMessage("junk-1", "2026-08-01T09:00:00Z")]
        : [
            restMessage("inbox-1", "2026-08-01T10:00:00Z"),
            restMessage("inbox-2", "2026-08-01T08:00:00Z"),
          ];
      return new Response(JSON.stringify({ value }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
  });

  it("loads each folder at its own offset and merges by received time", async () => {
    const result = await fetchInboxAndJunk({ id: "a", mailProtocol: "outlook" } as never, {
      limit: 2,
      inboxOffset: 20,
      junkOffset: 7,
    });
    expect(result.messages.map((message) => message.id)).toEqual(["inbox-1", "junk-1", "inbox-2"]);
    expect(result.folders).toEqual({
      inbox: { loaded: 2, nextOffset: 22, hasMore: true },
      junk: { loaded: 1, nextOffset: 8, hasMore: false },
    });
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("$skip=20"))).toBe(true);
    expect(urls.some((url) => url.includes("$skip=7"))).toBe(true);
  });
});
