import { desc, eq, and } from "drizzle-orm";
import { diff, safeParsePlanGraph, type PlanDiff, type PlanGraph } from "@raah/plan-graph";
import type { Db } from "../client";
import { planGraphs } from "../schema";

/**
 * plan_graphs persistence (P1.6, ARCH §5.2): full graph per version plus a
 * computed structural diff. The Zod schema is the single validator — the DB
 * never stores a graph that fails validation. Rollback never deletes: it
 * writes a NEW version copying the old graph (replay is priceless).
 */

export class PlanGraphValidationError extends Error {
  constructor(readonly issues: unknown) {
    super("PlanGraph failed schema validation — refusing to persist");
    this.name = "PlanGraphValidationError";
  }
}

export interface PlanGraphVersionInfo {
  version: number;
  parentVersion: number | null;
  jobId: string | null;
  criticScore: number | null;
  createdAt: Date;
}

/**
 * Persist a new version. The version number is assigned here (latest + 1) and
 * stamped into `meta.version`; the diff vs the parent version is computed and
 * stored alongside. Concurrent saves for the same trip are serialized by the
 * (trip_id, version) primary key — the loser gets a unique-violation error.
 */
export async function savePlanGraphVersion(
  db: Db,
  input: { graph: PlanGraph; jobId?: string; criticScore?: number },
): Promise<{ version: number; diff: PlanDiff | null }> {
  const parsed = safeParsePlanGraph(input.graph);
  if (!parsed.success) throw new PlanGraphValidationError(parsed.error.issues);
  const graph = parsed.data;
  const tripId = graph.meta.trip_id;

  const [latest] = await db
    .select({ version: planGraphs.version, graph: planGraphs.graph })
    .from(planGraphs)
    .where(eq(planGraphs.tripId, tripId))
    .orderBy(desc(planGraphs.version))
    .limit(1);

  const nextVersion = latest ? latest.version + 1 : 1;
  const stored: PlanGraph = { ...graph, meta: { ...graph.meta, version: nextVersion } };

  let structuralDiff: PlanDiff | null = null;
  if (latest) {
    const parent = safeParsePlanGraph(latest.graph);
    if (parent.success) structuralDiff = diff(parent.data, stored);
  }

  await db.insert(planGraphs).values({
    tripId,
    version: nextVersion,
    graph: stored,
    diff: structuralDiff,
    parentVersion: latest?.version ?? null,
    jobId: input.jobId ?? null,
    criticScore: input.criticScore ?? null,
  });

  return { version: nextVersion, diff: structuralDiff };
}

/** Load one version (validated on read); omit `version` for the latest. */
export async function loadPlanGraph(
  db: Db,
  tripId: string,
  version?: number,
): Promise<{ graph: PlanGraph; info: PlanGraphVersionInfo } | null> {
  const where =
    version === undefined
      ? eq(planGraphs.tripId, tripId)
      : and(eq(planGraphs.tripId, tripId), eq(planGraphs.version, version));
  const [row] = await db
    .select()
    .from(planGraphs)
    .where(where)
    .orderBy(desc(planGraphs.version))
    .limit(1);
  if (!row) return null;
  const parsed = safeParsePlanGraph(row.graph);
  if (!parsed.success) throw new PlanGraphValidationError(parsed.error.issues);
  return {
    graph: parsed.data,
    info: {
      version: row.version,
      parentVersion: row.parentVersion,
      jobId: row.jobId,
      criticScore: row.criticScore,
      createdAt: row.createdAt,
    },
  };
}

/** Stored diff for a version (what changed vs its parent), or null for v1. */
export async function loadPlanGraphDiff(
  db: Db,
  tripId: string,
  version: number,
): Promise<PlanDiff | null> {
  const [row] = await db
    .select({ diff: planGraphs.diff })
    .from(planGraphs)
    .where(and(eq(planGraphs.tripId, tripId), eq(planGraphs.version, version)))
    .limit(1);
  return (row?.diff as PlanDiff | null) ?? null;
}

export async function listPlanGraphVersions(
  db: Db,
  tripId: string,
): Promise<PlanGraphVersionInfo[]> {
  const rows = await db
    .select({
      version: planGraphs.version,
      parentVersion: planGraphs.parentVersion,
      jobId: planGraphs.jobId,
      criticScore: planGraphs.criticScore,
      createdAt: planGraphs.createdAt,
    })
    .from(planGraphs)
    .where(eq(planGraphs.tripId, tripId))
    .orderBy(desc(planGraphs.version));
  return rows;
}

/**
 * Rollback = a NEW version whose content copies `toVersion` (history is
 * append-only). Returns the new version number.
 */
export async function rollbackPlanGraph(
  db: Db,
  tripId: string,
  toVersion: number,
  jobId?: string,
): Promise<{ version: number; diff: PlanDiff | null }> {
  const target = await loadPlanGraph(db, tripId, toVersion);
  if (!target) throw new Error(`Rollback target v${toVersion} not found for trip ${tripId}`);
  return savePlanGraphVersion(db, { graph: target.graph, jobId });
}
