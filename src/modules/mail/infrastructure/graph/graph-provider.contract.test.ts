import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resetEnvironmentForTests } from "@/shared/config/env";
import { GraphMailProvider } from "./graph-provider";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3005";
  process.env.SESSION_SIGNING_KEY = "unit-session-signing-key-1234567890123456";
  process.env.DATA_ENCRYPTION_KEYS = "unit:unit-data-encryption-key-1234567890123456";
  process.env.CARD_KEY_HMAC_KEY = "unit-card-hmac-key-12345678901234567890";
  process.env.ADMIN_BOOTSTRAP_PASSWORD = "unit-bootstrap-password";
  resetEnvironmentForTests();
});

afterEach(() => vi.unstubAllGlobals());

const baseInput = {
  account: { id: "account-1", email: "one@example.com" },
  resolveToken: vi.fn(async () => "graph-access-token"),
};

describe("Graph MailProvider contract", () => {
  it("lists newest summaries, wraps nextLink and reads HTML detail", async () => {
    const nextLink = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=safe";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        value: [{
          id: "message/1",
          subject: "Code",
          bodyPreview: "preview",
          isRead: false,
          receivedDateTime: "2026-08-01T00:00:00Z",
          from: { emailAddress: { name: "OpenAI", address: "noreply@example.com" } },
        }],
        "@odata.nextLink": nextLink,
      }))
      .mockResolvedValueOnce(Response.json({
        id: "message/1",
        subject: "Code",
        body: { contentType: "html", content: "<p>123456</p>" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GraphMailProvider();
    const page = await provider.listMessages({ ...baseInput, folder: "inbox", limit: 20 });
    expect(page.messages[0]).toMatchObject({ protocol: "graph", folder: "inbox", subject: "Code" });
    expect(page.nextCursor).toMatch(/^v2:/);
    const detail = await provider.getMessage({ ...baseInput, folder: "inbox", messageId: page.messages[0]!.id });
    expect(detail).toMatchObject({ bodyHtml: "<p>123456</p>", bodyText: null });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer graph-access-token");
    expect(String(fetchMock.mock.calls[1][0])).toContain("message%2F1");
  });

  it("maps 429 and network failures to retryable safe categories", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("rate limited", {
      status: 429,
      headers: { "retry-after": "7" },
    })));
    const provider = new GraphMailProvider();
    await expect(provider.probe(baseInput)).rejects.toMatchObject({ code: "RATE_LIMITED", retryable: true, retryAfterMs: 7_000 });

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("socket detail"); }));
    await expect(provider.probe(baseInput)).rejects.toMatchObject({ code: "NETWORK_ERROR", retryable: true });
  });
});
