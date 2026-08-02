import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, update, create } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(async () => ({ id: "admin" })) }));
vi.mock("@/lib/prisma", () => ({ prisma: { mailAccount: { findUnique, update, create } } }));
vi.mock("@/lib/secrets", () => ({ encryptSecret: vi.fn((value: string) => `encrypted:${value.length}`) }));

import { POST } from "./route";

describe("account import feedback", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    create.mockReset();
  });

  it("redacts invalid input and reports it as a failed item", async () => {
    const secretInput = "not-an-email----super-secret-password----bad-client----secret-refresh-token";
    const response = await POST(new Request("http://localhost/api/accounts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: secretInput }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invalid[0].raw).toBe("[REDACTED]");
    expect(body.feedback).toMatchObject({ requested: 1, succeeded: 0, skipped: 0, failed: 1 });
    expect(JSON.stringify(body)).not.toContain("super-secret-password");
    expect(JSON.stringify(body)).not.toContain("secret-refresh-token");
  });

  it("continues importing other accounts after one database failure", async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("database detail"));
    const text = [
      "one@example.com----password-1----11111111-1111-1111-1111-111111111111----refresh-token-one",
      "two@example.com----password-2----22222222-2222-2222-2222-222222222222----refresh-token-two",
    ].join("\n");
    const response = await POST(new Request("http://localhost/api/accounts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }));
    const body = await response.json();

    expect(body).toMatchObject({ created: 1, feedback: { requested: 2, succeeded: 1, failed: 1 } });
    expect(body.feedback.issues[0]).toMatchObject({ email: "two@example.com", reasonCode: "PROCESSING_ERROR" });
    expect(JSON.stringify(body)).not.toContain("database detail");
  });
});
