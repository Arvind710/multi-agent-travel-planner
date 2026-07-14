import { addDays, daysBetween } from "@raah/shared/dates";
import type { NodeId } from "./ids";
import { indexNodes } from "./nodes";
import type { PlanGraph } from "./schema";

/**
 * Graph invariants (ARCH §5.3): enforced before any patch lands.
 *
 * Two tiers:
 * - structural (always, incl. mid-construction drafts): ids unique, refs exist,
 *   route chronology, days contiguous & date-aligned, legs adjacent,
 *   alternatives kind-match, nights math.
 * - completeness (strict — validated/shipped graphs): days cover the full route
 *   span, every stop has exactly one stay.
 *
 * The full table is documented in this package's README.
 */

export interface InvariantViolation {
  invariant: string;
  message: string;
  node_refs: NodeId[];
}

export interface CheckOptions {
  /** Also run completeness invariants (final validation / persistence of validated graphs). */
  strict?: boolean;
}

export function checkInvariants(graph: PlanGraph, opts: CheckOptions = {}): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const { byId, duplicates } = indexNodes(graph);

  for (const id of duplicates) {
    violations.push({
      invariant: "unique-node-ids",
      message: `Node id ${id} appears more than once`,
      node_refs: [id],
    });
  }

  const exists = (id: NodeId) => byId.has(id);

  // ── route chronology ────────────────────────────────────────────────────
  for (const stop of graph.route) {
    if (stop.depart < stop.arrive) {
      violations.push({
        invariant: "route-chronology",
        message: `Stop ${stop.place.name} departs (${stop.depart}) before it arrives (${stop.arrive})`,
        node_refs: [stop.node_id],
      });
    } else if (stop.nights !== daysBetween(stop.arrive, stop.depart)) {
      violations.push({
        invariant: "stop-nights-math",
        message: `Stop ${stop.place.name} says ${stop.nights} nights but ${stop.arrive}→${stop.depart} is ${daysBetween(stop.arrive, stop.depart)}`,
        node_refs: [stop.node_id],
      });
    }
  }
  for (let i = 1; i < graph.route.length; i++) {
    const prev = graph.route[i - 1];
    const next = graph.route[i];
    if (!prev || !next) continue;
    // Overnight transit allows arrive = depart + 1; anything else breaks the chain.
    if (next.arrive < prev.depart || next.arrive > addDays(prev.depart, 1)) {
      violations.push({
        invariant: "route-chronology",
        message: `Route breaks between ${prev.place.name} (depart ${prev.depart}) and ${next.place.name} (arrive ${next.arrive})`,
        node_refs: [prev.node_id, next.node_id],
      });
    }
  }

  // ── days: aligned to route, contiguous ──────────────────────────────────
  const stopIndex = new Map(graph.route.map((s, i) => [s.node_id, i] as const));
  for (const day of graph.days) {
    const idx = stopIndex.get(day.stop_ref);
    const stop = idx === undefined ? undefined : graph.route[idx];
    if (!stop || idx === undefined) {
      violations.push({
        invariant: "refs-exist",
        message: `Day ${day.date} references missing stop ${day.stop_ref}`,
        node_refs: [day.node_id, day.stop_ref],
      });
      continue;
    }
    // Window opens at the previous stop's depart (covers transit days), else arrival.
    const windowStart = idx > 0 ? (graph.route[idx - 1]?.depart ?? stop.arrive) : stop.arrive;
    if (day.date < windowStart || day.date > stop.depart) {
      violations.push({
        invariant: "day-date-aligned",
        message: `Day ${day.date} is outside its stop window ${windowStart}→${stop.depart} (${stop.place.name})`,
        node_refs: [day.node_id, stop.node_id],
      });
    }
  }
  const dates = graph.days.map((d) => d.date).sort();
  for (let i = 1; i < dates.length; i++) {
    const a = dates[i - 1];
    const b = dates[i];
    if (!a || !b) continue;
    if (a === b) {
      violations.push({
        invariant: "days-contiguous",
        message: `Two days share the date ${a}`,
        node_refs: graph.days.filter((d) => d.date === a).map((d) => d.node_id),
      });
    } else if (addDays(a, 1) !== b) {
      violations.push({
        invariant: "days-contiguous",
        message: `Gap in days between ${a} and ${b}`,
        node_refs: graph.days.filter((d) => d.date === a || d.date === b).map((d) => d.node_id),
      });
    }
  }

  // ── legs connect adjacent stops, in order ───────────────────────────────
  for (const leg of graph.legs) {
    const fromIdx = stopIndex.get(leg.from_stop_ref);
    const toIdx = stopIndex.get(leg.to_stop_ref);
    if (fromIdx === undefined || toIdx === undefined) {
      violations.push({
        invariant: "refs-exist",
        message: `Leg references missing stop(s)`,
        node_refs: [leg.node_id],
      });
      continue;
    }
    if (toIdx !== fromIdx + 1) {
      violations.push({
        invariant: "legs-adjacency",
        message: `Leg connects non-adjacent stops (route positions ${fromIdx} → ${toIdx})`,
        node_refs: [leg.node_id, leg.from_stop_ref, leg.to_stop_ref],
      });
      continue;
    }
    const from = graph.route[fromIdx];
    const to = graph.route[toIdx];
    if (from && to && (leg.depart_date < from.depart || leg.depart_date > to.arrive)) {
      violations.push({
        invariant: "legs-adjacency",
        message: `Leg departs ${leg.depart_date}, outside the ${from.depart}→${to.arrive} transfer window`,
        node_refs: [leg.node_id],
      });
    }
    if (leg.fallback_ref && !exists(leg.fallback_ref)) {
      violations.push({
        invariant: "refs-exist",
        message: `Leg fallback references missing risk node ${leg.fallback_ref}`,
        node_refs: [leg.node_id, leg.fallback_ref],
      });
    }
  }

  // ── stays reference stops; at most one per stop ─────────────────────────
  const staysByStop = new Map<NodeId, number>();
  for (const stay of graph.stays) {
    if (!exists(stay.stop_ref)) {
      violations.push({
        invariant: "refs-exist",
        message: `Stay ${stay.primary.name} references missing stop ${stay.stop_ref}`,
        node_refs: [stay.node_id, stay.stop_ref],
      });
      continue;
    }
    staysByStop.set(stay.stop_ref, (staysByStop.get(stay.stop_ref) ?? 0) + 1);
  }
  for (const [stopRef, count] of staysByStop) {
    if (count > 1) {
      violations.push({
        invariant: "one-stay-per-stop",
        message: `Stop ${stopRef} has ${count} stay assignments`,
        node_refs: [stopRef],
      });
    }
  }

  // ── budget line items reference real nodes ──────────────────────────────
  for (const item of graph.budget.line_items) {
    if (!exists(item.node_ref)) {
      violations.push({
        invariant: "line-item-refs",
        message: `Budget line "${item.label}" references missing node ${item.node_ref}`,
        node_refs: [item.node_id, item.node_ref],
      });
    }
  }

  // ── alternatives share the primary's kind ───────────────────────────────
  for (const day of graph.days) {
    for (const block of day.blocks) {
      for (const alt of block.alternatives) {
        if (alt.kind !== block.kind) {
          violations.push({
            invariant: "alternatives-kind",
            message: `Alternative "${alt.title}" is ${alt.kind}, primary "${block.title}" is ${block.kind}`,
            node_refs: [block.node_id, alt.node_id],
          });
        }
      }
    }
  }

  // ── risk / pretrip refs ─────────────────────────────────────────────────
  for (const risk of graph.risk) {
    const missing = [risk.target_ref, ...risk.plan_b.node_refs].filter((r) => !exists(r));
    if (missing.length > 0) {
      violations.push({
        invariant: "refs-exist",
        message: `Risk entry references missing node(s): ${missing.join(", ")}`,
        node_refs: [risk.node_id, ...missing],
      });
    }
  }
  for (const item of graph.pretrip) {
    const missing = item.refs.filter((r) => !exists(r));
    if (missing.length > 0) {
      violations.push({
        invariant: "refs-exist",
        message: `Pre-trip item "${item.label}" references missing node(s): ${missing.join(", ")}`,
        node_refs: [item.node_id, ...missing],
      });
    }
  }

  // ── strict completeness (validated/shipped graphs) ──────────────────────
  if (opts.strict && graph.route.length > 0) {
    const first = graph.route[0];
    const last = graph.route[graph.route.length - 1];
    if (first && last) {
      const span = daysBetween(first.arrive, last.depart) + 1;
      if (
        graph.days.length !== span ||
        dates[0] !== first.arrive ||
        dates[dates.length - 1] !== last.depart
      ) {
        violations.push({
          invariant: "days-cover-route",
          message: `Days must cover ${first.arrive}→${last.depart} exactly (${span} days); got ${graph.days.length}`,
          node_refs: [],
        });
      }
    }
    for (const stop of graph.route) {
      if (!staysByStop.has(stop.node_id) && stop.nights > 0) {
        violations.push({
          invariant: "stay-per-stop",
          message: `Stop ${stop.place.name} (${stop.nights} nights) has no stay assignment`,
          node_refs: [stop.node_id],
        });
      }
    }
  }

  return violations;
}
