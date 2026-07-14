/**
 * @raah/integrations — provider adapters gateway (ARCH §10).
 * THE ONLY PACKAGE ALLOWED TO MAKE EXTERNAL HTTP CALLS (CI rule `no-fetch-outside-integrations`).
 * Uniform ProviderAdapter pattern: timeout, retry, circuit breaker, normalize, cache policy.
 *
 * Adapters land per-provider from P3.4 (against mocks) and P7 (live). Placeholder until then.
 */
export const INTEGRATIONS_PACKAGE = "@raah/integrations" as const;
