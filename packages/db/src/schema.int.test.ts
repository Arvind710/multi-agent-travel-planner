import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "./client.js";
import { runMigrations } from "./migrate.js";
import { planGraphs, trips, users } from "./schema.js";

function dockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const hasDocker = dockerAvailable();

/**
 * Integration test on ephemeral Postgres (testcontainers, pgvector image).
 * Skipped when Docker is unavailable — CI always runs it.
 */
describe.skipIf(!hasDocker)("db schema round-trip (testcontainers)", () => {
  let container: { getConnectionUri(): string; stop(): Promise<unknown> };
  let db: Db;
  let pool: { end(): Promise<void> };

  beforeAll(async () => {
    const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
    container = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
    const url = container.getConnectionUri();
    await runMigrations(url);
    ({ db, pool } = createDb(url));
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("migrations apply cleanly and a user→trip→plan_graph round-trips", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: "t@example.com", name: "T" })
      .returning();
    expect(user?.id).toBeTruthy();

    const [trip] = await db
      .insert(trips)
      .values({ ownerId: user!.id, title: "Test trip" })
      .returning();
    expect(trip?.status).toBe("draft");

    await db.insert(planGraphs).values({
      tripId: trip!.id,
      version: 1,
      graph: { meta: { trip_id: trip!.id, version: 1 } },
    });

    const rows = await db.select().from(planGraphs).where(eq(planGraphs.tripId, trip!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe(1);
    expect((rows[0]?.graph as { meta: { version: number } }).meta.version).toBe(1);
  });

  it("enforces kb_entities (kind, slug) uniqueness", async () => {
    const { kbEntities } = await import("./schema.js");
    await db.insert(kbEntities).values({ kind: "monument", slug: "taj-mahal", data: {} });
    await expect(
      db.insert(kbEntities).values({ kind: "monument", slug: "taj-mahal", data: {} }),
    ).rejects.toThrow();
  });
});

// Always-on smoke so the file is never empty on machines without Docker.
describe("schema module", () => {
  it("exports tables", async () => {
    const schema = await import("./schema.js");
    expect(Object.keys(schema).length).toBeGreaterThan(10);
  });
});
