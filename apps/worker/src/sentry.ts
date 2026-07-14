import * as Sentry from "@sentry/node";
import { loadEnv } from "@raah/shared/env";

/** Error tracking (P0.14): active only when SENTRY_DSN is configured. */
export function initSentry(): void {
  const env = loadEnv();
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0,
  });
}
