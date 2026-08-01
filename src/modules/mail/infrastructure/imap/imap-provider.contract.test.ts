import { Readable } from "node:stream";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { resetEnvironmentForTests } from "@/shared/config/env";
import { ImapMailProvider, imapClientOptions } from "./imap-provider";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3005";
  process.env.SESSION_SIGNING_KEY = "unit-session-signing-key-1234567890123456";
  process.env.DATA_ENCRYPTION_KEYS = "unit:unit-data-encryption-key-1234567890123456";
  process.env.CARD_KEY_HMAC_KEY = "unit-card-hmac-key-12345678901234567890";
  process.env.ADMIN_BOOTSTRAP_PASSWORD = "unit-bootstrap-password";
  resetEnvironmentForTests();
});

function fakeClient() {
  const release = vi.fn();
  const client = {
    authenticated: true,
    usable: true,
    mailbox: { uidValidity: 42n, exists: 2 },
    connect: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    close: vi.fn(),
    list: vi.fn(async () => [{ path: "Junk Email", specialUse: "\\Junk" }]),
    getMailboxLock: vi.fn(async () => ({ release })),
    fetchAll: vi.fn(async () => [{
      seq: 2,
      uid: 200,
      envelope: {
        subject: "Verification",
        date: new Date("2026-08-01T00:00:00Z"),
        from: [{ address: "sender@example.com", name: "Sender" }],
      },
      flags: new Set(["\\Seen"]),
    }]),
    fetchOne: vi.fn(async () => ({
      seq: 2,
      uid: 200,
      envelope: { subject: "Verification", from: [{ address: "sender@example.com" }] },
      bodyStructure: { type: "text/html", part: "1", childNodes: [] },
    })),
    download: vi.fn(async () => ({ content: Readable.from(["<p>654321</p>"]) })),
  };
  return { client, release };
}

const baseInput = {
  account: { id: "account-1", email: "one@example.com" },
  resolveToken: vi.fn(async () => "imap-access-token"),
};

describe("IMAP MailProvider contract", () => {
  it("uses Outlook OAuth2 TLS settings and bounded timeouts", () => {
    expect(imapClientOptions("one@example.com", "token")).toMatchObject({
      host: "outlook.office365.com",
      port: 993,
      secure: true,
      auth: { user: "one@example.com", accessToken: "token" },
      logger: false,
      logRaw: false,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  });

  it("lists the special-use junk folder read-only and always releases resources", async () => {
    const { client, release } = fakeClient();
    const factory = vi.fn(() => client as any);
    const provider = new ImapMailProvider(factory);
    const page = await provider.listMessages({ ...baseInput, folder: "junk", limit: 20 });
    expect(factory).toHaveBeenCalledWith("one@example.com", "imap-access-token");
    expect(client.getMailboxLock).toHaveBeenCalledWith("Junk Email", expect.objectContaining({ readOnly: true }));
    expect(page.messages[0]).toMatchObject({ protocol: "imap", folder: "junk", subject: "Verification", isRead: true });
    expect(release).toHaveBeenCalledOnce();
    expect(client.logout).toHaveBeenCalledOnce();
  });

  it("validates UIDVALIDITY before loading a bounded HTML body", async () => {
    const first = fakeClient();
    const provider = new ImapMailProvider(() => first.client as any);
    const page = await provider.listMessages({ ...baseInput, folder: "inbox", limit: 20 });
    const detail = await provider.getMessage({ ...baseInput, folder: "inbox", messageId: page.messages[0]!.id });
    expect(detail.bodyHtml).toBe("<p>654321</p>");
    expect(first.client.download).toHaveBeenCalledWith("200", "1", expect.objectContaining({ uid: true }));

    first.client.mailbox.uidValidity = 99n;
    await expect(provider.getMessage({ ...baseInput, folder: "inbox", messageId: page.messages[0]!.id }))
      .rejects.toMatchObject({ code: "MESSAGE_NOT_FOUND", retryable: false });
  });
});
