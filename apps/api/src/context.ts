import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { createDb, type Db } from "@raah/db";
import { loadEnv } from "@raah/shared/env";
import { logger } from "./logger.js";

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);

export interface Session {
  userId: string | null;
  /** Anonymous visitors get a stable id for the 1-free-plan allowance (ARCH §11). */
  anonymousId: string | null;
}

export interface Context {
  db: Db;
  logger: typeof logger;
  session: Session;
}

/**
 * tRPC context per request. Session extraction is a stub until P0.9 wires
 * Auth.js JWT decoding + the anonymous-session cookie.
 */
export function createContext({ req }: CreateFastifyContextOptions): Context {
  return {
    db,
    logger: logger.child({ reqId: req.id }),
    session: { userId: null, anonymousId: null },
  };
}
