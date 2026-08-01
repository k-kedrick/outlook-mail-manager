import pino from "pino";
import { requestContext } from "./context";

const redact = [
  "password",
  "passwordCipher",
  "refreshToken",
  "refreshTokenCipher",
  "accessToken",
  "tokenCipher",
  "totpSecret",
  "totpSecretCipher",
  "code",
  "cardKey",
  "authorization",
  "headers.authorization",
  "req.headers.authorization",
];

const root = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "outlook-mail-manager", version: "2.0.0" },
  redact: { paths: redact, censor: "[REDACTED]" },
});

export function logger(bindings: Record<string, unknown> = {}): pino.Logger {
  const context = requestContext();
  return root.child({ ...context, ...bindings });
}
