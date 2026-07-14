import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

/**
 * Create a Db handle. Callers own the pool lifecycle (apps make one at boot,
 * tests make one per container) — no module-level singletons.
 */
export function createDb(databaseUrl: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
