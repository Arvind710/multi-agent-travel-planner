import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { loadEnv } from "@raah/shared/env";

/**
 * OTel bootstrap (P0.14, ARCH §14.1): instrumentation lives in code from day
 * one; the exporter stays off until scale phase (OTEL_ENABLED=true → console
 * spans for local debugging; OTLP endpoint is a scale-phase config swap).
 */
export function initOtel(serviceName: string): void {
  const env = loadEnv();
  if (!env.OTEL_ENABLED) return;
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new ConsoleSpanExporter(),
  });
  sdk.start();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => void sdk.shutdown().catch(() => {}));
  }
}
