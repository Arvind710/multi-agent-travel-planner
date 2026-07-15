/**
 * @raah/integrations — provider adapters gateway (ARCH §10).
 * THE ONLY PACKAGE ALLOWED TO MAKE EXTERNAL HTTP CALLS (CI rule `no-fetch-outside-integrations`).
 * Uniform ProviderAdapter pattern: timeout, retry, circuit breaker, normalize, cache policy.
 */

export const INTEGRATIONS_PACKAGE = "@raah/integrations" as const;

export * from "./adapter";
export * from "./maps";
export * from "./weather";
export * from "./aqi";
export * from "./fx";
export * from "./deep-links";
export * from "./notifications";
