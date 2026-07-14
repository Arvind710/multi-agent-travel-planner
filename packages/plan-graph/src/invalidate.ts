import type { NodeId } from "./ids";
import { indexNodes } from "./nodes";
import type { PlanGraph } from "./schema";

/**
 * Targeted invalidation (ARCH §5.4): given changed nodes (or an intent),
 * compute the DirtySet — everything that must be recomputed. Edits invalidate
 * subgraphs, not plans; cost and latency scale with the size of the change.
 *
 * Propagation rules (documented in the package README):
 * - stop   → its days (+ their blocks/meals), its stay, legs touching it,
 *            budget, risk, pretrip, packing
 * - day    → its blocks + meals, budget
 * - block  → its parent day (energy re-check), budget
 * - meal   → budget
 * - stay   → budget
 * - leg    → budget, risk, pretrip
 * - line_item → budget (ledger)
 * - concept → everything (a concept change is a re-plan)
 * - date_shift intent → everything date-dependent: days, blocks, meals, legs,
 *            stays, budget, risk, pretrip, packing
 */

export const DIRTY_SECTIONS = ["budget", "risk", "pretrip", "packing"] as const;
export type DirtySection = (typeof DIRTY_SECTIONS)[number];

export interface DirtySet {
  /** Sorted, unique node ids needing recomputation. */
  node_ids: NodeId[];
  /** Cross-cutting sections whose owning agents must re-run. */
  sections: DirtySection[];
}

export type InvalidateIntent =
  /** Trip dates moved: everything date-dependent is dirty. */
  | { kind: "date_shift" }
  /** Specific nodes changed (same as passing the ids directly). */
  | { kind: "node_change"; node_ids: NodeId[] };

export function invalidate(graph: PlanGraph, seeds: NodeId[] | InvalidateIntent): DirtySet {
  const nodeIds = new Set<NodeId>();
  const sections = new Set<DirtySection>();
  const { byId } = indexNodes(graph);

  const markSection = (section: DirtySection) => {
    sections.add(section);
    switch (section) {
      case "budget":
        nodeIds.add(graph.budget.node_id);
        for (const li of graph.budget.line_items) nodeIds.add(li.node_id);
        break;
      case "risk":
        for (const r of graph.risk) nodeIds.add(r.node_id);
        break;
      case "pretrip":
        for (const p of graph.pretrip) nodeIds.add(p.node_id);
        break;
      case "packing":
        nodeIds.add(graph.packing.node_id);
        break;
    }
  };

  const markDayDeep = (dayId: NodeId) => {
    nodeIds.add(dayId);
    const day = graph.days.find((d) => d.node_id === dayId);
    if (!day) return;
    for (const b of day.blocks) nodeIds.add(b.node_id);
    for (const m of day.meals) nodeIds.add(m.node_id);
  };

  const dateDependentAll = () => {
    for (const day of graph.days) markDayDeep(day.node_id);
    for (const leg of graph.legs) nodeIds.add(leg.node_id);
    for (const stay of graph.stays) nodeIds.add(stay.node_id);
    for (const section of DIRTY_SECTIONS) markSection(section);
  };

  const expand = (seed: NodeId) => {
    const entry = byId.get(seed);
    if (!entry) return; // removed node: its own id still lands in the set below
    switch (entry.kind) {
      case "stop": {
        for (const day of graph.days) {
          if (day.stop_ref === seed) markDayDeep(day.node_id);
        }
        for (const stay of graph.stays) {
          if (stay.stop_ref === seed) nodeIds.add(stay.node_id);
        }
        for (const leg of graph.legs) {
          if (leg.from_stop_ref === seed || leg.to_stop_ref === seed) nodeIds.add(leg.node_id);
        }
        markSection("budget");
        markSection("risk");
        markSection("pretrip");
        markSection("packing");
        break;
      }
      case "day":
        markDayDeep(seed);
        markSection("budget");
        break;
      case "block": {
        if ("parent_ref" in entry.location) nodeIds.add(entry.location.parent_ref);
        markSection("budget");
        break;
      }
      case "meal":
      case "stay":
      case "line_item":
        markSection("budget");
        break;
      case "leg":
        markSection("budget");
        markSection("risk");
        markSection("pretrip");
        break;
      case "concept": {
        for (const [id] of byId) nodeIds.add(id);
        for (const section of DIRTY_SECTIONS) markSection(section);
        break;
      }
      case "ledger":
        markSection("budget");
        break;
      case "risk":
        markSection("risk");
        break;
      case "pretrip":
        markSection("pretrip");
        break;
      case "packing":
        markSection("packing");
        break;
    }
  };

  const seedIds = Array.isArray(seeds) ? seeds : seeds.kind === "node_change" ? seeds.node_ids : [];

  if (!Array.isArray(seeds) && seeds.kind === "date_shift") {
    dateDependentAll();
  }

  for (const seed of seedIds) {
    nodeIds.add(seed);
    expand(seed);
  }

  return {
    node_ids: [...nodeIds].sort(),
    sections: DIRTY_SECTIONS.filter((s) => sections.has(s)),
  };
}

/** Convenience: is a node dirty in this set? */
export function isDirty(dirty: DirtySet, nodeId: NodeId): boolean {
  return dirty.node_ids.includes(nodeId);
}
