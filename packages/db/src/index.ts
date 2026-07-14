/**
 * @raah/db — Drizzle schema + migrations for all ARCH §8.1 tables.
 * DETERMINISTIC PACKAGE: zero LLM calls (CI-enforced).
 */
export * from "./schema.js";
export { createDb, pingDb, type Db } from "./client.js";
export { runMigrations } from "./migrate.js";
