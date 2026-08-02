/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "argon2",
    "imapflow",
    "pino",
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/sdk-node",
  ],
};

export default nextConfig;
