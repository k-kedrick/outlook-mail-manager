import { z } from "zod";
import { readFileSync } from "node:fs";

const nonDefaultSecret = z
  .string()
  .min(32)
  .refine((value) => !/replace|change-me|example|test-only/i.test(value), "must not use a public default");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  SESSION_SIGNING_KEY: z.string().min(32),
  DATA_ENCRYPTION_KEYS: z.string().min(1),
  CARD_KEY_HMAC_KEY: z.string().min(32),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12),
  MICROSOFT_CLIENT_ID: z.string().uuid().optional(),
  MICROSOFT_CERTIFICATE_PATH: z.string().min(1).optional(),
  MICROSOFT_PRIVATE_KEY_PATH: z.string().min(1).optional(),
  MICROSOFT_CERTIFICATE_THUMBPRINT: z.string().min(20).optional(),
  WORKER_ID: z.string().min(1).optional(),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(2_000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(10),
  OAUTH_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  GRAPH_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(10),
  IMAP_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  METRICS_BEARER_TOKEN: z.string().min(32).optional(),
});

export type ServerEnvironment = z.infer<typeof schema>;

let cached: ServerEnvironment | undefined;

function validateProductionSecrets(value: ServerEnvironment): void {
  if (value.NODE_ENV !== "production") return;
  for (const [name, secret] of [
    ["SESSION_SIGNING_KEY", value.SESSION_SIGNING_KEY],
    ["CARD_KEY_HMAC_KEY", value.CARD_KEY_HMAC_KEY],
    ["ADMIN_BOOTSTRAP_PASSWORD", value.ADMIN_BOOTSTRAP_PASSWORD],
  ] as const) {
    const result = nonDefaultSecret.safeParse(secret);
    if (!result.success) throw new Error(`${name} is not production-safe`);
  }
  for (const entry of value.DATA_ENCRYPTION_KEYS.split(",")) {
    const separator = entry.indexOf(":");
    const secret = separator >= 0 ? entry.slice(separator + 1).trim() : "";
    if (!nonDefaultSecret.safeParse(secret).success) {
      throw new Error("DATA_ENCRYPTION_KEYS contains a production-unsafe key");
    }
  }
  if (!value.MICROSOFT_CLIENT_ID) return;
  if (
    !value.MICROSOFT_CERTIFICATE_PATH
    || !value.MICROSOFT_PRIVATE_KEY_PATH
    || !value.MICROSOFT_CERTIFICATE_THUMBPRINT
  ) {
    throw new Error("Microsoft managed OAuth requires certificate, private-key and thumbprint configuration");
  }
}

export function env(): ServerEnvironment {
  if (cached) return cached;
  const input = { ...process.env };
  for (const [name, value] of Object.entries(input)) {
    if (value === "") delete input[name];
  }
  for (const name of [
    "SESSION_SIGNING_KEY",
    "DATA_ENCRYPTION_KEYS",
    "CARD_KEY_HMAC_KEY",
    "ADMIN_BOOTSTRAP_PASSWORD",
    "METRICS_BEARER_TOKEN",
  ] as const) {
    const path = process.env[`${name}_FILE`];
    if (path) input[name] = readFileSync(path, "utf8").trim();
  }
  const parsed = schema.parse(input);
  validateProductionSecrets(parsed);
  cached = parsed;
  return parsed;
}

export function resetEnvironmentForTests(): void {
  cached = undefined;
}
