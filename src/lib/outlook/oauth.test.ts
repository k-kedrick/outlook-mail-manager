import { beforeEach, describe, expect, it, vi } from "vitest";

const { update } = vi.hoisted(() => ({ update: vi.fn(async () => ({})) }));
vi.mock("@/lib/prisma", () => ({ prisma: { mailAccount: { update } } }));
vi.mock("@/lib/secrets", () => ({ decryptSecret: vi.fn(() => "refresh-token"), encryptSecret: vi.fn((v: string) => `enc:${v}`) }));

import { getAccessToken } from "./oauth";

describe("token refresh concurrency", () => {
  beforeEach(() => {
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
    const account = {
      id: "account-1",
      clientId: "client-id",
      refreshTokenCipher: "encrypted",
      graphTokenCipher: null,
      graphTokenExpiresAt: null,
      imapTokenCipher: null,
      imapTokenExpiresAt: null,
    } as never;
    const [a, b] = await Promise.all([
      getAccessToken(account, "graph"),
      getAccessToken(account, "graph"),
    ]);
    expect(a).toBe("access-token");
    expect(b).toBe("access-token");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
