import { beforeEach, describe, expect, it, vi } from "vitest";

let sessionVersion = 1;
vi.mock("@/lib/settings", () => ({ getConfig: vi.fn(async () => ({ sessionVersion })) }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { createSessionToken, verifySessionToken } from "./auth";

describe("versioned sessions", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.APP_SECRET = "test-secret";
    sessionVersion = 1;
  });

  it("invalidates an existing token after the session version changes", async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
    sessionVersion = 2;
    expect(await verifySessionToken(token)).toBe(false);
  });
});
