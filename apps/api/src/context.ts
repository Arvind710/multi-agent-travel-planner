import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { createDb, type Db } from "@raah/db";
import { loadEnv } from "@raah/shared/env";
import { logger } from "./logger";
import { sessionFromCookieHeader, type Session } from "./session";

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);

export type { Session };

export interface Context {
  db: Db;
  logger: typeof logger;
  session: Session;
}

/** tRPC context per request: verified Auth.js JWT (no DB hit) + anonymous cookie. */
export async function createContext({ req }: CreateFastifyContextOptions): Promise<Context> {
  const session = await sessionFromCookieHeader(req.headers.cookie);
  return {
    db,
    logger: logger.child({ reqId: req.id, userId: session.userId ?? undefined }),
    session,
  };
}
