import { describe, expect, it } from "vitest";
import type { MailMessage } from "@/modules/mail/domain/mail-provider";
import { extractVerificationCode } from "./code-extractor";

function message(input: Partial<MailMessage>): MailMessage {
  return { id: "m1", protocol: "graph", folder: "inbox", from: "sender@example.com", fromName: null, subject: "", receivedAt: null, preview: "", isRead: false, bodyText: null, bodyHtml: null, ...input };
}

describe("verification code extraction", () => {
  it("extracts Chinese and English code formats", () => {
    expect(extractVerificationCode(message({ subject: "您的验证码：268906" }))).toBe("268906");
    expect(extractVerificationCode(message({ bodyHtml: "<p>Your temporary verification code is <b>AB12CD</b></p>" }))).toBe("AB12CD");
  });

  it("does not treat arbitrary numbers as a verification code", () => {
    expect(extractVerificationCode(message({ bodyText: "Invoice 123456 was paid" }))).toBeNull();
  });
});
