import { Redis } from "ioredis";
import { loadEnv } from "@raah/shared/env";

const env = loadEnv();

/** Shared command connection (lazy — api boots even if Redis is down; health reports it). */
export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

redis.on("error", () => {
  /* surfaced via /health; avoid unhandled-error crash loops */
});

/** SSE subscribers need dedicated connections (subscribe mode blocks commands). */
export function createSubscriber(): Redis {
  const sub = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  sub.on("error", () => {});
  return sub;
}
