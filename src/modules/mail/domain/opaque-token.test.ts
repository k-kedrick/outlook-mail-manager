import { beforeAll, describe, expect, it } from "vitest";
import { resetEnvironmentForTests } from "@/shared/config/env";
import { decodeMailToken, encodeMailToken } from "./opaque-token";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3005";
  process.env.SESSION_SIGNING_KEY = "unit-session-signing-key-1234567890123456";
  process.env.DATA_ENCRYPTION_KEYS = "unit:unit-data-encryption-key-1234567890123456";
  process.env.CARD_KEY_HMAC_KEY = "unit-card-hmac-key-12345678901234567890";
  process.env.ADMIN_BOOTSTRAP_PASSWORD = "unit-bootstrap-password";
  resetEnvironmentForTests();
});

describe("opaque mail tokens", () => {
  it("round-trips a signed/encrypted provider reference", () => {
    const token = encodeMailToken({ version: 1, kind: "message", protocol: "imap", folder: "junk", value: "42:17" });
    expect(decodeMailToken(token, "message")).toMatchObject({ protocol: "imap", folder: "junk", value: "42:17" });
  });

  it("rejects tampering, wrong token kinds and expired cursors", () => {
    const token = encodeMailToken({ version: 1, kind: "cursor", protocol: "graph", folder: "inbox", value: "next", expiresAt: Date.now() - 1 });
    expect(() => decodeMailToken(token, "cursor")).toThrowError(expect.objectContaining({ code: "CURSOR_EXPIRED" }));
    const message = encodeMailToken({ version: 1, kind: "message", protocol: "graph", folder: "inbox", value: "id" });
    expect(() => decodeMailToken(message, "cursor")).toThrowError(expect.objectContaining({ code: "INVALID_CURSOR" }));
    const parts = message.split(":");
    const encrypted = parts[4];
    parts[4] = `${encrypted.startsWith("A") ? "B" : "A"}${encrypted.slice(1)}`;
    const changed = parts.join(":");
    expect(() => decodeMailToken(changed, "message")).toThrowError(expect.objectContaining({ code: "INVALID_CURSOR" }));
  });
});
