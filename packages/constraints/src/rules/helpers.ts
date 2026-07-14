import type { Day, PlanGraph, Stop } from "@raah/plan-graph";
import { dateRange, monthOf } from "@raah/shared/dates";

export function stopOfDay(graph: PlanGraph, day: Day): Stop | undefined {
  return graph.route.find((s) => s.node_id === day.stop_ref);
}

/** Distinct months (1–12) a stop's stay spans. */
export function monthsOfStop(stop: Stop): number[] {
  return [...new Set(dateRange(stop.arrive, stop.depart).map(monthOf))];
}

/** The KB slug for a stop's place: explicit kb_ref, else lowercased name. */
export function placeSlug(stop: Stop): string {
  return stop.place.kb_ref ?? stop.place.name.toLowerCase();
}
