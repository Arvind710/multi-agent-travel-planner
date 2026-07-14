import { formatMoney } from "@raah/shared/money";
import type { NodeId, NodeKind } from "./ids";
import { indexNodes, type AnyNode, type NodeEntry } from "./nodes";
import type { GraphPatch } from "./patch";
import type { PlanGraph } from "./schema";

/**
 * Node-level structural diff (ARCH §5.3): `diff(a, b)` compares two versions
 * by stable node id; `diffToPatches` converts a diff back into a patch such
 * that `applyPatch(a, diffToPatches(diff(a, b)))` reproduces b exactly
 * (property-tested). `summarizeDiff` renders human-readable hunks for the
 * DiffBanner ("track changes for trips").
 */

export interface FieldChange {
  path: string;
  from: unknown;
  to: unknown;
}

export interface AddedNode {
  node_id: NodeId;
  kind: NodeKind;
  node: AnyNode;
  parent_ref?: NodeId;
  /** Final position in b's collection. */
  index: number;
}

export interface RemovedNode {
  node_id: NodeId;
  kind: NodeKind;
  label: string;
}

export interface ChangedNode {
  node_id: NodeId;
  kind: NodeKind;
  /** Deep field paths for UI rendering. */
  fields: FieldChange[];
  /** Top-level replacement data for patch round-trips. */
  set: Record<string, unknown>;
  unset: string[];
}

export interface MovedNode {
  node_id: NodeId;
  kind: NodeKind;
  from_parent_ref?: NodeId;
  to_parent_ref?: NodeId;
  /** Final position in b's collection. */
  to_index: number;
}

export interface PlanDiff {
  added: AddedNode[];
  removed: RemovedNode[];
  changed: ChangedNode[];
  moved: MovedNode[];
  meta_changed: FieldChange[];
}

/** Child collections live as separate nodes — exclude from parent content diff. */
const CHILD_FIELDS: Partial<Record<NodeKind, string[]>> = {
  day: ["blocks", "meals"],
  ledger: ["line_items"],
};

function contentOf(entry: NodeEntry): Record<string, unknown> {
  const excluded = CHILD_FIELDS[entry.kind] ?? [];
  return Object.fromEntries(
    Object.entries(entry.node as Record<string, unknown>).filter(([k]) => !excluded.includes(k)),
  );
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function deepFieldChanges(a: unknown, b: unknown, path: string): FieldChange[] {
  if (jsonEqual(a, b)) return [];
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) => deepFieldChanges(a[k], b[k], path === "" ? k : `${path}.${k}`));
  }
  return [{ path, from: a, to: b }];
}

/** Addressable entries only (embedded block alternatives excluded). */
function addressable(graph: PlanGraph): Map<NodeId, NodeEntry> {
  const { byId } = indexNodes(graph);
  const out = new Map<NodeId, NodeEntry>();
  for (const [id, entry] of byId) {
    if (entry.location.collection === "blocks" && entry.location.index === -1) continue;
    out.set(id, entry);
  }
  return out;
}

function parentOf(entry: NodeEntry): NodeId | undefined {
  return "parent_ref" in entry.location ? entry.location.parent_ref : undefined;
}

function indexOf(entry: NodeEntry): number {
  return "index" in entry.location ? entry.location.index : 0;
}

/** Collection identity for ordering: kind + parent (blocks/meals are per-day). */
function collectionKey(entry: NodeEntry): string {
  return `${entry.location.collection}:${parentOf(entry) ?? ""}`;
}

export function diff(a: PlanGraph, b: PlanGraph): PlanDiff {
  const aNodes = addressable(a);
  const bNodes = addressable(b);

  const added: AddedNode[] = [];
  const removed: RemovedNode[] = [];
  const changed: ChangedNode[] = [];
  const moved: MovedNode[] = [];

  for (const [id, entry] of aNodes) {
    if (!bNodes.has(id)) {
      removed.push({ node_id: id, kind: entry.kind, label: labelOf(entry) });
    }
  }

  for (const [id, bEntry] of bNodes) {
    const aEntry = aNodes.get(id);
    if (!aEntry) {
      added.push({
        node_id: id,
        kind: bEntry.kind,
        node: structuredClone(bEntry.node),
        parent_ref: parentOf(bEntry),
        index: indexOf(bEntry),
      });
      continue;
    }
    const aContent = contentOf(aEntry);
    const bContent = contentOf(bEntry);
    if (!jsonEqual(aContent, bContent)) {
      const keys = [...new Set([...Object.keys(aContent), ...Object.keys(bContent)])];
      const set: Record<string, unknown> = {};
      const unset: string[] = [];
      for (const key of keys) {
        if (key === "node_id") continue;
        if (!(key in bContent)) unset.push(key);
        else if (!jsonEqual(aContent[key], bContent[key]))
          set[key] = structuredClone(bContent[key]);
      }
      changed.push({
        node_id: id,
        kind: bEntry.kind,
        fields: deepFieldChanges(aContent, bContent, ""),
        set,
        unset,
      });
    }
  }

  // Moves: parent changed, or rank among surviving common nodes changed.
  const rank = (nodes: Map<NodeId, NodeEntry>, other: Map<NodeId, NodeEntry>) => {
    const ranks = new Map<NodeId, number>();
    const counters = new Map<string, number>();
    const sorted = [...nodes.values()]
      .filter((e) => other.has(e.node_id) && e.location.collection !== "singleton")
      .sort((x, y) => indexOf(x) - indexOf(y));
    for (const entry of sorted) {
      const key = collectionKey(entry);
      const next = counters.get(key) ?? 0;
      counters.set(key, next + 1);
      ranks.set(entry.node_id, next);
    }
    return ranks;
  };
  const aRanks = rank(aNodes, bNodes);
  const bRanks = rank(bNodes, aNodes);
  for (const [id, bEntry] of bNodes) {
    const aEntry = aNodes.get(id);
    if (!aEntry || bEntry.location.collection === "singleton") continue;
    const parentChanged = parentOf(aEntry) !== parentOf(bEntry);
    const rankChanged =
      aRanks.get(id) !== bRanks.get(id) || collectionKey(aEntry) !== collectionKey(bEntry);
    if (parentChanged || rankChanged) {
      moved.push({
        node_id: id,
        kind: bEntry.kind,
        from_parent_ref: parentOf(aEntry),
        to_parent_ref: parentOf(bEntry),
        to_index: indexOf(bEntry),
      });
    }
  }

  return {
    added,
    removed,
    changed,
    moved,
    meta_changed: deepFieldChanges(a.meta, b.meta, "meta"),
  };
}

/**
 * Convert a diff into a patch reproducing b from a.
 * Order: removes → adds+moves per collection in target order → content updates.
 * Note: meta changes are not patchable (versioning owns meta).
 */
export function diffToPatches(planDiff: PlanDiff): GraphPatch {
  const patch: GraphPatch = [];

  for (const r of planDiff.removed) {
    patch.push({ op: "remove_node", node_id: r.node_id });
  }

  // Per collection, place added + moved nodes at their final index, ascending:
  // each op lands on a correctly-ordered prefix, so absolute indices are exact.
  type Placement =
    | { type: "add"; entry: AddedNode; index: number }
    | { type: "move"; entry: MovedNode; index: number };
  const placements: Placement[] = [
    ...planDiff.added.map((entry) => ({ type: "add" as const, entry, index: entry.index })),
    ...planDiff.moved.map((entry) => ({ type: "move" as const, entry, index: entry.to_index })),
  ].sort((x, y) => x.index - y.index);

  for (const p of placements) {
    if (p.type === "add") {
      patch.push({
        op: "add_node",
        node: p.entry.node as unknown as Record<string, unknown>,
        parent_ref: p.entry.parent_ref,
        index: p.entry.index,
      });
    } else {
      patch.push({
        op: "move_node",
        node_id: p.entry.node_id,
        to_index: p.entry.to_index,
        to_parent_ref: p.entry.to_parent_ref,
      });
    }
  }

  for (const c of planDiff.changed) {
    patch.push({ op: "update_node", node_id: c.node_id, set: c.set, unset: c.unset });
  }

  return patch;
}

// ── human-readable summary (DiffBanner) ──────────────────────────────────────

export interface DiffHunk {
  text: string;
  node_refs: NodeId[];
}

function labelOf(entry: NodeEntry): string {
  const n = entry.node as Record<string, unknown>;
  switch (entry.kind) {
    case "block":
      return `block "${String(n.title)}"`;
    case "meal":
      return `meal "${String(n.venue)}"`;
    case "day":
      return `day ${String(n.date)}`;
    case "stop":
      return `stop ${String((n.place as { name?: string } | undefined)?.name ?? "?")}`;
    case "stay":
      return `stay "${String((n.primary as { name?: string } | undefined)?.name ?? "?")}"`;
    case "leg":
      return "transit leg";
    case "line_item":
      return `budget line "${String(n.label)}"`;
    case "risk":
      return "risk entry";
    case "pretrip":
      return `pre-trip item "${String(n.label)}"`;
    default:
      return entry.kind;
  }
}

function locate(graph: PlanGraph, id: NodeId): string {
  const { byId } = indexNodes(graph);
  const entry = byId.get(id);
  if (!entry) return "";
  const parent = parentOf(entry);
  if (parent) {
    const day = byId.get(parent);
    if (day) return ` on ${labelOf(day)}`;
  }
  return "";
}

/** Render a diff as DiffBanner hunks, e.g. "Removed block 'Amber Fort' on day 2026-12-07". */
export function summarizeDiff(planDiff: PlanDiff, before: PlanGraph, after: PlanGraph): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const bIndex = addressable(after);

  for (const r of planDiff.removed) {
    hunks.push({ text: `Removed ${r.label}${locate(before, r.node_id)}`, node_refs: [r.node_id] });
  }
  for (const a of planDiff.added) {
    const entry = bIndex.get(a.node_id);
    hunks.push({
      text: `Added ${entry ? labelOf(entry) : a.kind}${locate(after, a.node_id)}`,
      node_refs: [a.node_id],
    });
  }
  for (const m of planDiff.moved) {
    const entry = bIndex.get(m.node_id);
    const crossed = m.from_parent_ref !== m.to_parent_ref ? locate(after, m.node_id) : "";
    hunks.push({
      text: `Moved ${entry ? labelOf(entry) : m.kind}${crossed ? ` to${crossed.replace(" on", "")}` : ""}`,
      node_refs: [m.node_id],
    });
  }
  for (const c of planDiff.changed) {
    const entry = bIndex.get(c.node_id);
    if (
      c.node_id === after.budget.node_id &&
      before.budget.total.amount !== after.budget.total.amount
    ) {
      hunks.push({
        text: `Budget total ${formatMoney(before.budget.total)} → ${formatMoney(after.budget.total)}`,
        node_refs: [c.node_id],
      });
      continue;
    }
    const fields = [...new Set(c.fields.map((f) => f.path.split(".")[0] ?? f.path))].join(", ");
    hunks.push({
      text: `Changed ${entry ? labelOf(entry) : c.kind}: ${fields}`,
      node_refs: [c.node_id],
    });
  }
  return hunks;
}
