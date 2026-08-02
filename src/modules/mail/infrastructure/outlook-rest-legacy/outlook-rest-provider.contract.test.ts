import { afterEach, describe, expect, it, vi } from "vitest";
import { OutlookRestLegacyProvider } from "./outlook-rest-provider";

afterEach(() => vi.unstubAllGlobals());

const baseInput = {
  account: { id: "account-1", email: "one@example.com" },
  resolveToken: vi.fn(async () => "legacy-access-token"),
};

describe("legacy Outlook REST MailProvider contract", () => {
  it("keeps the legacy channel isolated and paginates with an opaque offset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      value: [{
        Id: "legacy-1",
        Subject: "Legacy message",
        From: { EmailAddress: { Address: "sender@example.com" } },
      }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OutlookRestLegacyProvider();
    const page = await provider.listMessages({ ...baseInput, folder: "junk", limit: 1 });
    expect(page.messages[0]).toMatchObject({ protocol: "outlook_rest_legacy", folder: "junk" });
    expect(page.nextCursor).toMatch(/^v2:/);
    expect(String(fetchMock.mock.calls[0][0])).toContain("MailFolders/JunkEmail/messages");
    expect(fetchMock.mock.calls[0][1].headers["X-AnchorMailbox"]).toBe("one@example.com");
  });

  it("never treats a retired endpoint permission denial as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));
    await expect(new OutlookRestLegacyProvider().probe(baseInput))
      .rejects.toMatchObject({ code: "PERMISSION_DENIED", retryable: false });
  });
});
