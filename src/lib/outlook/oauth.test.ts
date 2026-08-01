import { beforeEach, describe, expect, it, vi } from "vitest";

const { update, findUnique } = vi.hoisted(() => ({
  update: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})),
  findUnique: vi.fn(async () => ({
    refreshTokenCipher: "encrypted",
    graphTokenCipher: null,
    graphTokenExpiresAt: null,
    imapTokenCipher: null,
    imapTokenExpiresAt: null,
  })),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { mailAccount: { update, findUnique } } }));
vi.mock("@/lib/secrets", () => ({ decryptSecret: vi.fn(() => "refresh-token"), encryptSecret: vi.fn((v: string) => `enc:${v}`) }));

import { getAccessToken, resetOAuthStateForTests, statusFromError } from "./oauth";

function account(id: string, cached = false) {
  return {
    id,
    clientId: "client-id",
    refreshTokenCipher: "encrypted",
    refreshTokenUpdatedAt: null,
    refreshTokenExpiresAt: null,
    graphTokenCipher: cached ? "cached" : null,
    graphTokenExpiresAt: cached ? new Date(Date.now() + 3_600_000) : null,
    imapTokenCipher: null,
    imapTokenExpiresAt: null,
  } as never;
}

describe("token refresh concurrency", () => {
  beforeEach(() => {
    resetOAuthStateForTests();
    update.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify({ access_token: "access-token", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
  });

  it("shares one refresh request for concurrent calls on the same account", async () => {
    const target = account("account-1");
    const [a, b] = await Promise.all([
      getAccessToken(target, "graph"),
      getAccessToken(target, "graph"),
    ]);
    expect(a).toBe("access-token");
    expect(b).toBe("access-token");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("serializes different token audiences instead of sharing the wrong access token", async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const scope = String(init?.body);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify({ access_token: scope.includes("graph.microsoft.com") ? "graph-token" : "imap-token", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const target = account("different-audiences");
    const [graph, imap] = await Promise.all([
      getAccessToken(target, "graph"),
      getAccessToken(target, "imap"),
    ]);
    expect(graph).toBe("graph-token");
    expect(imap).toBe("imap-token");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it("ignores a valid access-token cache for an explicit keep-alive", async () => {
    await getAccessToken(account("force-cached", true), "graph", { forceRefresh: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        refreshTokenUpdatedAt: expect.any(Date),
        refreshTokenExpiresAt: expect.any(Date),
      }),
    }));
  });

  it("reports a repeated force refresh as throttled instead of reusing cache", async () => {
    const target = account("force-repeat");
    await getAccessToken(target, "graph", { forceRefresh: true });
    await expect(getAccessToken(target, "graph", { forceRefresh: true })).rejects.toMatchObject({
      code: "throttled",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("shares one genuine exchange between concurrent force refreshes", async () => {
    const target = account("force-concurrent");
    await Promise.all([
      getAccessToken(target, "graph", { forceRefresh: true }),
      getAccessToken(target, "graph", { forceRefresh: true }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("does not treat an in-flight normal cache fill as a force refresh", async () => {
    const target = account("mixed-concurrent");
    const normal = getAccessToken(target, "graph");
    const forced = getAccessToken(target, "graph", { forceRefresh: true });
    await expect(normal).resolves.toBe("access-token");
    await expect(forced).rejects.toMatchObject({ code: "throttled" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses the provider refresh-token expiry when one is returned", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "access-token", expires_in: 3600, refresh_token_expires_in: 7200 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const before = Date.now();
    await getAccessToken(account("provider-expiry"), "graph", { forceRefresh: true });
    const expiry = update.mock.calls[0]?.[0].data.refreshTokenExpiresAt as Date;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + 7_200_000);
    expect(expiry.getTime()).toBeLessThanOrEqual(Date.now() + 7_200_000);
  });

  it("classifies an IMAP authentication rejection without declaring the refresh token dead", () => {
    expect(statusFromError({ authenticationFailed: true })).toBe("LOCKED");
  });
});
