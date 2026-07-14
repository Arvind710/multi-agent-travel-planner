import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyPatch, diff } from "@raah/plan-graph";
import { buildGoldenKerala7d } from "@raah/plan-graph/testing";
import { unwrap } from "@raah/shared/result";
import { createDb, type Db } from "../client";
import { runMigrations } from "../migrate";
import { trips, users } from "../schema";
import {
  listPlanGraphVersions,
  loadPlanGraph,
  loadPlanGraphDiff,
  PlanGraphValidationError,
  rollbackPlanGraph,
  savePlanGraphVersion,
} from "./planGraphs";

function dockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const hasDocker = dockerAvailable();

describe("savePlanGraphVersion validation (no DB needed)", () => {
  it("rejects an invalid graph before touching the database", async () => {
    const neverCalled = new Proxy(
      {},
      {
        get() {
          throw new Error("db must not be touched for invalid graphs");
        },
      },
    ) as Db;
    await expect(
      savePlanGraphVersion(neverCalled, { graph: { meta: {} } as never }),
    ).rejects.toThrow(PlanGraphValidationError);
  });
});

describe.skipIf(!hasDocker)("plan_graphs versioning round-trip (testcontainers)", () => {
  let container: { getConnectionUri(): string; stop(): Promise<unknown> };
  let db: Db;
  let pool: { end(): Promise<void> };
  let tripId: string;

  beforeAll(async () => {
    const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
    container = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
    const url = container.getConnectionUri();
    await runMigrations(url);
    ({ db, pool } = createDb(url));
    const [user] = await db.insert(users).values({ email: "pg@example.com" }).returning();
    if (!user) throw new Error("no user");
    const [trip] = await db
      .insert(trips)
      .values({ ownerId: user.id, title: "Kerala golden" })
      .returning();
    if (!trip) throw new Error("no trip");
    tripId = trip.id;
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("save v1 → patch → save v2 → stored diff matches → rollback ≡ v1", async () => {
    const base = buildGoldenKerala7d();
    const graph1 = { ...base, meta: { ...base.meta, trip_id: tripId } };

    const v1 = await savePlanGraphVersion(db, { graph: graph1, jobId: "job-1" });
    expect(v1).toEqual({ version: 1, diff: null });

    const loaded1 = await loadPlanGraph(db, tripId);
    if (!loaded1) throw new Error("v1 missing");
    expect(loaded1.info.version).toBe(1);
    expect(loaded1.graph.meta.version).toBe(1);

    const day = loaded1.graph.days[0];
    const block = day?.blocks[0];
    if (!day || !block) throw new Error("fixture incomplete");
    const graph2 = unwrap(
      applyPatch(
        loaded1.graph,
        [
          { op: "remove_node", node_id: block.node_id },
          { op: "update_node", node_id: day.node_id, set: { theme: "Slow morning" } },
        ],
        { actor: "user" },
      ),
    );

    const v2 = await savePlanGraphVersion(db, { graph: graph2, jobId: "job-2" });
    expect(v2.version).toBe(2);

    const loaded2 = await loadPlanGraph(db, tripId, 2);
    if (!loaded2) throw new Error("v2 missing");
    expect(loaded2.info.parentVersion).toBe(1);

    // stored diff == diff(v1, v2)
    const storedDiff = await loadPlanGraphDiff(db, tripId, 2);
    const recomputed = diff(loaded1.graph, loaded2.graph);
    expect(JSON.parse(JSON.stringify(storedDiff))).toEqual(JSON.parse(JSON.stringify(recomputed)));
    expect(storedDiff?.removed.map((r) => r.node_id)).toContain(block.node_id);

    // rollback creates v3 whose content ≡ v1 (modulo meta.version)
    const v3 = await rollbackPlanGraph(db, tripId, 1);
    expect(v3.version).toBe(3);
    const loaded3 = await loadPlanGraph(db, tripId, 3);
    if (!loaded3) throw new Error("v3 missing");
    expect({ ...loaded3.graph, meta: { ...loaded3.graph.meta, version: 1 } }).toEqual(
      loaded1.graph,
    );

    const versions = await listPlanGraphVersions(db, tripId);
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(versions.map((v) => v.parentVersion)).toEqual([2, 1, null]);
  });
});
