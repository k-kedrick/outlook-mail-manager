import { describe, expect, it, vi } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

import { GET } from "./route";

describe("health route", () => {
  it("returns 200 when SQLite responds", async () => {
    queryRaw.mockResolvedValueOnce([{ 1: 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", database: "ok" });
  });

  it("returns 503 without exposing the database exception", async () => {
    queryRaw.mockRejectedValueOnce(new Error("sensitive database path"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("sensitive database path");
  });
});
