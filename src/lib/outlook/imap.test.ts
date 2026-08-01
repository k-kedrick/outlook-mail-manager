import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  instances: [] as any[],
  mailboxes: [] as any[],
  exists: 0,
  uidValidity: 1n,
  fetchMessages: [] as any[],
  fetchOneResult: false as any,
  connectError: null as Error | null,
  downloads: {} as Record<string, string>,
}));

vi.mock("./oauth", () => ({ getAccessToken: vi.fn(async () => "imap-access-token") }));
vi.mock("imapflow", () => {
  class AuthenticationFailure extends Error {
    authenticationFailed = true as const;
  }
  class ImapFlow {
    options: any;
    authenticated: string | boolean = false;
    usable = false;
    mailbox: any = false;
    released = false;
    loggedOut = false;
    closed = false;
    fetchRange: string | null = null;
    lockedPath: string | null = null;
    downloadedParts: string[] = [];
    constructor(options: any) {
      this.options = options;
      state.instances.push(this);
    }
    async connect() {
      if (state.connectError) throw state.connectError;
      this.authenticated = "account@example.com";
      this.usable = true;
    }
    async list() { return state.mailboxes; }
    async getMailboxLock(path: string) {
      this.lockedPath = path;
      this.mailbox = { path, exists: state.exists, uidValidity: state.uidValidity };
      return { release: () => { this.released = true; } };
    }
    async fetchAll(range: string) {
      this.fetchRange = range;
      return state.fetchMessages;
    }
    async fetchOne() { return state.fetchOneResult; }
    async download(_uid: string, part: string) {
      const { Readable } = await import("node:stream");
      this.downloadedParts.push(part);
      return { meta: { contentType: "text/plain", expectedSize: 0 }, content: Readable.from([state.downloads[part] ?? ""]) };
    }
    async logout() { this.loggedOut = true; this.usable = false; }
    close() { this.closed = true; this.usable = false; }
  }
  return { ImapFlow, AuthenticationFailure };
});

import { decodeImapMessageId, encodeImapMessageId, imapInbox, imapMessage, resolveImapFolder } from "./imap";

const account = { id: "a", email: "account@example.com" } as never;

describe("IMAP adapter", () => {
  beforeEach(() => {
    state.instances.length = 0;
    state.mailboxes = [];
    state.exists = 0;
    state.uidValidity = 1n;
    state.fetchMessages = [];
    state.fetchOneResult = false;
    state.connectError = null;
    state.downloads = {};
  });

  it("uses Outlook OAuth2 TLS settings and paginates newest sequence numbers", async () => {
    state.exists = 25;
    state.uidValidity = 99n;
    state.fetchMessages = [
      { seq: 11, uid: 101, envelope: { subject: "older" }, flags: new Set() },
      { seq: 20, uid: 110, envelope: { subject: "newer" }, flags: new Set(["\\Seen"]) },
    ];
    const messages = await imapInbox(account, { limit: 10, offset: 5, withBody: false, folder: "inbox" });
    const client = state.instances[0];

    expect(client.options).toMatchObject({
      host: "outlook.office365.com",
      port: 993,
      secure: true,
      auth: { user: "account@example.com", accessToken: "imap-access-token" },
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      logger: false,
    });
    expect(client.fetchRange).toBe("11:20");
    expect(messages.map((message) => message.subject)).toEqual(["newer", "older"]);
    expect(decodeImapMessageId(messages[0].id)).toEqual({ version: 1, path: "INBOX", uidValidity: "99", uid: 110 });
    expect(client.released).toBe(true);
    expect(client.loggedOut).toBe(true);
  });

  it("resolves junk by special-use and common fallback names", () => {
    expect(resolveImapFolder("junk", [{ path: "Correo no deseado", specialUse: "\\Junk" } as never])).toBe("Correo no deseado");
    expect(resolveImapFolder("junk", [{ path: "Junk Email" } as never])).toBe("Junk Email");
    expect(() => resolveImapFolder("junk", [])).toThrow("未找到垃圾邮件文件夹");
  });

  it("downloads only text MIME parts and never attachment parts", async () => {
    state.exists = 1;
    state.fetchMessages = [{
      seq: 1,
      uid: 10,
      envelope: { subject: "code" },
      flags: new Set(),
      bodyStructure: {
        type: "multipart/mixed",
        childNodes: [
          { part: "1", type: "text/plain" },
          { part: "2", type: "application/pdf", disposition: "attachment" },
          { part: "3", type: "text/html" },
        ],
      },
    }];
    state.downloads = { "1": "verification code 123456", "3": "<b>123456</b>" };
    const messages = await imapInbox(account, { limit: 10, offset: 0, withBody: true, folder: "inbox" });
    expect(state.instances[0].downloadedParts).toEqual(["1", "3"]);
    expect(messages[0]).toMatchObject({ bodyText: "verification code 123456", bodyHtml: "<b>123456</b>" });
  });

  it("rejects stale UIDVALIDITY and still releases the lock and connection", async () => {
    state.uidValidity = 8n;
    const id = encodeImapMessageId({ path: "INBOX", uidValidity: "7", uid: 42 });
    await expect(imapMessage(account, id)).rejects.toThrow("邮箱版本已变化");
    expect(state.instances[0].released).toBe(true);
    expect(state.instances[0].loggedOut).toBe(true);
  });

  it("closes a connection that fails before authentication", async () => {
    state.connectError = new Error("socket detail");
    await expect(imapInbox(account, { limit: 10, offset: 0, withBody: false, folder: "inbox" })).rejects.toThrow("IMAP 服务暂时不可用");
    expect(state.instances[0].closed).toBe(true);
  });

  it("rejects malformed opaque message ids", () => {
    expect(() => decodeImapMessageId("not-json")).toThrow("邮件标识无效");
  });
});
