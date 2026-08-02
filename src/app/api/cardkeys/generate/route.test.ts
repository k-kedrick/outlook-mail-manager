import { describe, expect, it, vi } from "vitest";

const { findMany, create } = vi.hoisted(() => ({ findMany: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(async () => ({ id: "admin" })) }));
vi.mock("@/lib/cardkey", () => ({ buildCode: vi.fn(() => "TEST-ABCDEFGH") }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    mailAccount: { findMany },
    cardKey: { create, update: vi.fn() },
  },
}));

import { POST } from "./route";

describe("card-key batch feedback", () => {
  it("continues after one account fails and returns a safe partial result", async () => {
    findMany.mockResolvedValue([
      { id: "a", email: "a@example.com", cardKey: null },
      { id: "b", email: "b@example.com", cardKey: null },
    ]);
    create.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("unique database detail"));

    const response = await POST(new Request("http://localhost/api/cardkeys/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["a", "b"], prefix: "TEST", regenerate: false }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ generated: 1, feedback: { requested: 2, succeeded: 1, failed: 1 } });
    expect(body.feedback.issues[0]).toMatchObject({ email: "b@example.com", reasonCode: "PROCESSING_ERROR" });
    expect(JSON.stringify(body)).not.toContain("unique database detail");
  });
});
