import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { createDb, pingDb } from "@raah/db";
import { loadEnv } from "@raah/shared/env";
import { logger } from "./logger";
import { redis } from "./redis";
import { appRouter } from "./router";
import { createContext } from "./context";
import { sseRoutes } from "./sse";

const env = loadEnv();

const app = Fastify({ loggerInstance: logger, requestIdHeader: "x-request-id" });

await app.register(cors, {
  origin: [env.WEB_URL],
  credentials: true,
});

await app.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter, createContext },
});

await app.register(sseRoutes);

// Liveness + dependency health (degraded ≠ down: api reports what it can reach).
const { db } = createDb(env.DATABASE_URL);
app.get("/health", async () => {
  const [pg, rd] = await Promise.all([
    pingDb(db)
      .then(() => "ok" as const)
      .catch(() => "unreachable" as const),
    redis
      .ping()
      .then(() => "ok" as const)
      .catch(() => "unreachable" as const),
  ]);
  return { status: pg === "ok" && rd === "ok" ? "ok" : "degraded", postgres: pg, redis: rd };
});

// Public REST surface placeholder — OpenAPI generated from Zod once /v1 routes exist (ARCH §6.4).
app.get("/v1/openapi.json", async () => ({
  openapi: "3.1.0",
  info: { title: "Raah public API", version: "0.0.0" },
  paths: {},
}));

app.listen({ port: env.API_PORT, host: "0.0.0.0" }).catch((err) => {
  logger.error(err, "api failed to start");
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
