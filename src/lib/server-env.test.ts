import { afterEach, describe, expect, it, vi } from "vitest";
import { adminPassword, appSecret } from "./server-env";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("production environment validation", () => {
  it("rejects missing and default production credentials", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.APP_SECRET;
    delete process.env.ADMIN_PASSWORD;
    expect(() => appSecret()).toThrow(/APP_SECRET/);
    process.env.APP_SECRET = "x".repeat(32);
    expect(() => adminPassword()).toThrow(/ADMIN_PASSWORD/);
  });

  it("accepts strong explicit production credentials", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_SECRET = "a".repeat(32);
    process.env.ADMIN_PASSWORD = "a-long-unique-admin-password";
    expect(appSecret()).toHaveLength(32);
    expect(adminPassword()).toBe("a-long-unique-admin-password");
  });
});
