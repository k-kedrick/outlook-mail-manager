import { describe, expect, it, vi } from "vitest";

const { fetchInbox } = vi.hoisted(() => ({ fetchInbox: vi.fn() }));
vi.mock("./mail", () => ({ fetchInbox }));
vi.mock("@/lib/prisma", () => ({ prisma: { mailAccount: { update: vi.fn() } } }));
vi.mock("./oauth", () => ({ statusFromError: vi.fn(() => "ERROR") }));

import { findLatestCodeAcrossFolders } from "./code-service";

function message(id: string, subject: string, receivedAt: string) {
  return {
    id,
    source: "outlook",
    from: "sender@example.com",
    fromName: null,
    subject,
    receivedAt,
    preview: "",
    isRead: false,
    bodyHtml: null,
    bodyText: null,
  };
}

describe("verification-code pagination", () => {
  it("continues beyond the first 20 messages and stops after finding a code", async () => {
    fetchInbox.mockImplementation(async (_account, options) => {
      if (options.folder === "junk") return { source: "outlook", messages: [] };
      if (options.offset === 0) {
        return {
          source: "outlook",
          messages: Array.from({ length: 20 }, (_, i) =>
            message(`normal-${i}`, "普通邮件", `2026-08-01T09:${String(59 - i).padStart(2, "0")}:00Z`),
          ),
        };
      }
      return {
        source: "outlook",
        messages: [message("code", "Your verification code is 123456", "2026-08-01T08:00:00Z")],
      };
    });

    const result = await findLatestCodeAcrossFolders({ id: "a" } as never);
    expect(result?.code).toBe("123456");
    expect(fetchInbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ offset: 20 }));
  });
});
