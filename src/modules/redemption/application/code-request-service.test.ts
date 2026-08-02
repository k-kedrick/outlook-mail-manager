import { beforeAll, describe, expect, it, vi } from "vitest";
import { resetEnvironmentForTests } from "@/shared/config/env";
import type { MailMessage } from "@/modules/mail/domain/mail-provider";
import { CodeRequestService } from "./code-request-service";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3005";
  process.env.SESSION_SIGNING_KEY = "unit-session-signing-key-1234567890123456";
  process.env.DATA_ENCRYPTION_KEYS = "unit:unit-data-encryption-key-1234567890123456";
  process.env.CARD_KEY_HMAC_KEY = "unit-card-hmac-key-12345678901234567890";
  process.env.ADMIN_BOOTSTRAP_PASSWORD = "unit-bootstrap-password";
  resetEnvironmentForTests();
});

function mail(subject: string): MailMessage {
  return { id: "message", protocol: "graph", folder: "inbox", from: "sender@example.com", fromName: null, subject, receivedAt: new Date().toISOString(), preview: "", isRead: false, bodyText: null, bodyHtml: null };
}

describe("CodeRequestService", () => {
  it("creates a bounded watch with an unguessable retrieval credential", async () => {
    const cardKeys = { resolve: vi.fn(async () => ({ id: "card", accountId: "account", account: { email: "one@example.com", secret: { totpCipher: "cipher" } } })) };
    const jobs = { enqueue: vi.fn(async () => ({ id: "job" })) };
    const requests = { create: vi.fn(async (input) => ({ id: "request", accountId: input.accountId, status: "pending", resultCodeCipher: null, resultSubject: null, resultFrom: null, resultReceivedAt: null, lastErrorCode: null, expiresAt: input.expiresAt })) };
    const service = new CodeRequestService(cardKeys as any, jobs as any, {} as any, requests as any);
    const result = await service.create("CARD-CODE");
    expect(result).toMatchObject({ requestId: "request", email: "one@example.com", hasTotp: true, pollAfterMs: 2000 });
    expect(result.retrievalToken.length).toBeGreaterThan(30);
    expect(jobs.enqueue).toHaveBeenCalledWith(expect.objectContaining({ maxAttempts: 60, priority: 20 }));
  });

  it("searches inbox and junk, then persists only the encrypted code", async () => {
    const requests = {
      findById: vi.fn(async () => ({ id: "request", accountId: "account", status: "pending", expiresAt: new Date(Date.now() + 60_000) })),
      markRunning: vi.fn(), markPending: vi.fn(), markFound: vi.fn(), markFailed: vi.fn(),
    };
    const mailRouter = { list: vi.fn(async ({ folder }) => ({ messages: folder === "junk" ? [mail("您的验证码：268906")] : [], nextCursor: null })), getMessage: vi.fn() };
    const service = new CodeRequestService({} as any, {} as any, mailRouter as any, requests as any);
    await expect(service.execute("request")).resolves.toEqual({ found: true });
    expect(requests.markFound).toHaveBeenCalledWith(expect.objectContaining({ id: "request", subject: "您的验证码：268906" }));
    expect(requests.markFound.mock.calls[0][0].resultCodeCipher).not.toBe("268906");
  });

  it("returns a retryable not-found result without completing the request", async () => {
    const requests = {
      findById: vi.fn(async () => ({ id: "request", accountId: "account", status: "pending", expiresAt: new Date(Date.now() + 60_000) })),
      markRunning: vi.fn(), markPending: vi.fn(), markFound: vi.fn(), markFailed: vi.fn(),
    };
    const mailRouter = { list: vi.fn(async () => ({ messages: [], nextCursor: null })), getMessage: vi.fn() };
    const service = new CodeRequestService({} as any, {} as any, mailRouter as any, requests as any);
    await expect(service.execute("request")).rejects.toMatchObject({ code: "CODE_NOT_FOUND_YET", retryable: true, retryAfterMs: 10_000 });
    expect(requests.markPending).toHaveBeenCalledWith("request");
  });
});
