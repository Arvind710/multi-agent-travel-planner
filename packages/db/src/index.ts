/**
 * @raah/db — Drizzle schema + migrations for all ARCH §8.1 tables.
 * DETERMINISTIC PACKAGE: zero LLM calls (CI-enforced).
 */
export * from "./schema";
export { createDb, pingDb, type Db } from "./client";
export { runMigrations } from "./migrate";
export { getTripRole, roleAtLeast, type TripRole } from "./repos/trips";
export {
  savePlanGraphVersion,
  loadPlanGraph,
  loadPlanGraphDiff,
  listPlanGraphVersions,
  rollbackPlanGraph,
  PlanGraphValidationError,
  type PlanGraphVersionInfo,
} from "./repos/planGraphs";
