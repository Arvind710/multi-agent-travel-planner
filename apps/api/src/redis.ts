import { Redis } from "ioredis";
import { loadEnv } from "@raah/shared/env";

const env = loadEnv();

/**
 * Shared command connection. Offline queue stays ON so commands issued while the
 * connection is still establishing wait instead of failing; maxRetriesPerRequest: 1
 * keeps health pings honest (fast rejection when Redis is actually down).
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
});

redis.on("error", () => {
  /* surfaced via /health; avoid unhandled-error crash loops */
});

/** SSE subscribers need dedicated connections (subscribe mode blocks commands). */
export function createSubscriber(): Redis {
  const sub = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
  sub.on("error", () => {});
  return sub;
}
