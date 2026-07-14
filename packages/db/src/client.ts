import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

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

/** Health probe — keeps raw SQL (and the drizzle-orm dep) out of the apps. */
export async function pingDb(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}
