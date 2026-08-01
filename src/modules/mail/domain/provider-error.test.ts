import { describe, expect, it } from "vitest";
import { publicProviderMessage, type ProviderErrorCode } from "./provider-error";

describe("publicProviderMessage", () => {
  it("maps every internal provider category to a fixed safe message", () => {
    const codes: ProviderErrorCode[] = [
      "AUTH_REQUIRED",
      "PERMISSION_DENIED",
      "MAILBOX_DISABLED",
      "RATE_LIMITED",
      "NETWORK_ERROR",
      "PROVIDER_UNAVAILABLE",
      "MESSAGE_NOT_FOUND",
      "CURSOR_EXPIRED",
      "INVALID_CURSOR",
    ];
    for (const code of codes) {
      const message = publicProviderMessage(code);
      expect(message).toBeTruthy();
      expect(message).not.toContain("token");
      expect(message).not.toContain("provider response");
    }
    expect(publicProviderMessage("NETWORK_ERROR")).toBe(publicProviderMessage("PROVIDER_UNAVAILABLE"));
  });
});
