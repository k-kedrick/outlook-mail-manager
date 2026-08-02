import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

type Metrics = {
  registry: Registry;
  providerRequests: Counter<"provider" | "operation" | "outcome">;
  providerDuration: Histogram<"provider" | "operation">;
  jobs: Counter<"type" | "outcome">;
};

const globalMetrics = globalThis as typeof globalThis & { outlookMetrics?: Metrics };

function createMetrics(): Metrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "outlook_manager_" });
  return {
    registry,
    providerRequests: new Counter({
      name: "outlook_manager_provider_requests_total",
      help: "Mail-provider requests by operation and outcome",
      labelNames: ["provider", "operation", "outcome"],
      registers: [registry],
    }),
    providerDuration: new Histogram({
      name: "outlook_manager_provider_request_duration_seconds",
      help: "Mail-provider latency",
      labelNames: ["provider", "operation"],
      buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
      registers: [registry],
    }),
    jobs: new Counter({
      name: "outlook_manager_jobs_total",
      help: "Worker job outcomes",
      labelNames: ["type", "outcome"],
      registers: [registry],
    }),
  };
}

export const metrics = globalMetrics.outlookMetrics ?? createMetrics();
if (process.env.NODE_ENV !== "production") globalMetrics.outlookMetrics = metrics;
