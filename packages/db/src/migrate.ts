import { fileURLToPath } from "node:url";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const MIGRATIONS_FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

/** Apply all pending migrations (idempotent). Ensures pgvector extension first. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

// CLI entrypoint: pnpm --filter @raah/db migrate
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const url = process.env.DATABASE_URL ?? "postgres://raah:raah@localhost:5432/raah";
  runMigrations(url)
    .then(() => {
      console.log("✔ migrations applied");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
