import { describe, expect, it } from "vitest";
import { routeError } from "./api";

describe("public route errors", () => {
  it("returns a request id without exposing the internal error message", async () => {
    const response = routeError(new Error("secret-token-value"));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.error.details.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(body)).not.toContain("secret-token-value");
  });
});
