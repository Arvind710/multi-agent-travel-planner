import type { PlanGraph } from "../schema";
import { buildGraph, seededIds } from "./builders";

/**
 * Golden fixture graphs (P1.5) — used repo-wide in later phases' tests.
 * Deterministic: same seed → same ids → same JSON. The checked-in JSON files
 * under `fixtures/` are generated from these specs (`pnpm fixtures:generate`);
 * a test asserts they never drift.
 */

/** 14-day Rajasthan circuit: Jaipur → Bundi → Udaipur → Jodhpur (13 nights). */
export function buildGoldenRajasthan14d(): PlanGraph {
  return buildGraph({
    trip_id: "trip-golden-rajasthan",
    start: "2026-12-05",
    ids: seededIds(1),
    stops: [
      { name: "Jaipur", region: "rajasthan", nights: 4, stayPricePerNight: 7500 },
      {
        name: "Bundi",
        region: "rajasthan",
        nights: 2,
        legMode: "train",
        legMinutes: 260,
        stayPricePerNight: 4000,
      },
      {
        name: "Udaipur",
        region: "rajasthan",
        nights: 4,
        legMode: "car",
        legMinutes: 300,
        stayPricePerNight: 9000,
      },
      {
        name: "Jodhpur",
        region: "rajasthan",
        nights: 3,
        legMode: "train",
        legMinutes: 330,
        stayPricePerNight: 6500,
      },
    ],
    // Within ±10% of the builder's ledger total (₹104,000) — golden graphs
    // must pass the budget-bounds constraint rule.
    statedBudget: 110000,
  });
}

/** 7-day Kerala trip: Kochi → Munnar → Alleppey (6 nights). */
export function buildGoldenKerala7d(): PlanGraph {
  return buildGraph({
    trip_id: "trip-golden-kerala",
    start: "2027-01-10",
    ids: seededIds(2),
    stops: [
      { name: "Fort Kochi", region: "kerala", nights: 2, stayPricePerNight: 5500 },
      {
        name: "Munnar",
        region: "kerala",
        nights: 2,
        legMode: "car",
        legMinutes: 270,
        stayPricePerNight: 6000,
      },
      {
        name: "Alleppey",
        region: "kerala",
        nights: 2,
        legMode: "car",
        legMinutes: 320,
        stayPricePerNight: 8000,
      },
    ],
    // Within ±10% of the builder's ledger total (₹46,000).
    statedBudget: 48000,
  });
}
