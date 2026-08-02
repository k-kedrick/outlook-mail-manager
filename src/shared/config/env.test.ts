import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env, resetEnvironmentForTests } from "./env";

const productionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://outlook:secret@postgres:5432/outlook",
  NEXT_PUBLIC_APP_URL: "https://outlook.example.com",
  SESSION_SIGNING_KEY: "production-session-signing-key-1234567890",
  DATA_ENCRYPTION_KEYS: "key-2026:production-data-encryption-key-1234567890",
  CARD_KEY_HMAC_KEY: "production-card-key-hmac-key-123456789012",
  ADMIN_BOOTSTRAP_PASSWORD: "production-bootstrap-password-123456",
};

describe("server environment", () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(productionEnvironment)) vi.stubEnv(name, value);
    resetEnvironmentForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvironmentForTests();
  });

  it("requires the complete managed OAuth certificate configuration", () => {
    vi.stubEnv("MICROSOFT_CLIENT_ID", "5e5f0f01-1111-4111-8111-111111111111");
    vi.stubEnv("MICROSOFT_CERTIFICATE_PATH", "/run/secrets/microsoft.crt");
    vi.stubEnv("MICROSOFT_PRIVATE_KEY_PATH", "/run/secrets/microsoft.key");
    expect(() => env()).toThrow(/thumbprint/);
  });

  it("rejects public defaults inside the data-encryption keyring", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEYS", "v1:change-me-change-me-change-me-change-me");
    expect(() => env()).toThrow(/production-unsafe/);
  });

  it("accepts a complete production configuration", () => {
    vi.stubEnv("MICROSOFT_CLIENT_ID", "5e5f0f01-1111-4111-8111-111111111111");
    vi.stubEnv("MICROSOFT_CERTIFICATE_PATH", "/run/secrets/microsoft.crt");
    vi.stubEnv("MICROSOFT_PRIVATE_KEY_PATH", "/run/secrets/microsoft.key");
    vi.stubEnv("MICROSOFT_CERTIFICATE_THUMBPRINT", "00112233445566778899AABBCCDDEEFF00112233");
    expect(env().NODE_ENV).toBe("production");
  });
});
