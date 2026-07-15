/**
 * @raah/db — Drizzle schema + migrations for all ARCH §8.1 tables.
 * DETERMINISTIC PACKAGE: zero LLM calls (CI-enforced).
 */
export * from "./schema";
export { createDb, pingDb, type Db } from "./client";
export { runMigrations } from "./migrate";
export {
  getTripRole,
  roleAtLeast,
  createTrip,
  setTripStatus,
  listTripsByOwner,
  listTravellerProfiles,
  type TripRole,
} from "./repos/trips";
export {
  createShareLink,
  getShareLink,
  listTripComments,
  addTripComment,
  type ShareLink,
  type TripComment,
} from "./repos/share";
export {
  savePlanGraphVersion,
  loadPlanGraph,
  loadPlanGraphDiff,
  listPlanGraphVersions,
  rollbackPlanGraph,
  PlanGraphValidationError,
  type PlanGraphVersionInfo,
} from "./repos/planGraphs";
export { upsertKbEntity, type KbUpsertInput } from "./repos/kb";
