import { z } from "zod";
import { err, ok, type Result } from "@raah/shared/result";
import { AnyNodeId, kindOf, type NodeId, type NodeKind } from "./ids";
import {
  collectionFor,
  indexNodes,
  lockOf,
  SINGLETON_KINDS,
  type AnyNode,
  type CollectionKind,
} from "./nodes";
import { checkInvariants, type InvariantViolation } from "./invariants";
import {
  Block,
  Concept,
  Day,
  FragileLeg,
  Ledger,
  LineItem,
  LockState,
  MealSlot,
  PackingList,
  PlanGraph,
  StayAssignment,
  Stop,
  TimelineItem,
  TransitLeg,
} from "./schema";

/**
 * The mutation engine (ARCH §5.3): agents emit patches, never whole graphs.
 * `applyPatch` is pure — it clones, applies, re-validates the schema, checks
 * invariants, and only then returns the new graph.
 */

// ── patch ops ────────────────────────────────────────────────────────────────

export const AddNodeOp = z.object({
  op: z.literal("add_node"),
  /** Full node payload; its `node_id` prefix decides which collection it joins. */
  node: z.record(z.string(), z.unknown()),
  /** Required for block/meal: the day that owns it. */
  parent_ref: AnyNodeId.optional(),
  /** Insert position; append when omitted. */
  index: z.number().int().min(0).optional(),
});

export const UpdateNodeOp = z.object({
  op: z.literal("update_node"),
  node_id: AnyNodeId,
  /** Top-level fields to set (node_id itself is immutable). */
  set: z.record(z.string(), z.unknown()).default({}),
  /** Top-level optional fields to remove. */
  unset: z.array(z.string()).default([]),
});

export const RemoveNodeOp = z.object({
  op: z.literal("remove_node"),
  node_id: AnyNodeId,
});

export const MoveNodeOp = z.object({
  op: z.literal("move_node"),
  node_id: AnyNodeId,
  to_index: z.number().int().min(0),
  /** For block/meal: move across days. */
  to_parent_ref: AnyNodeId.optional(),
});

export const SetLockOp = z.object({
  op: z.literal("set_lock"),
  node_id: AnyNodeId,
  lock: LockState,
});

export const GraphPatchOp = z.discriminatedUnion("op", [
  AddNodeOp,
  UpdateNodeOp,
  RemoveNodeOp,
  MoveNodeOp,
  SetLockOp,
]);
export type GraphPatchOp = z.infer<typeof GraphPatchOp>;
/** Patches are authored in input form (defaults optional) and parsed on entry. */
export type GraphPatch = z.input<typeof GraphPatchOp>[];

// ── actors & errors ──────────────────────────────────────────────────────────

/**
 * Who is applying the patch: "user", "system", or an agent name.
 * Only "user" bypasses lock protection (locks exist FOR the user).
 */
export type PatchActor = string;

export interface ApplyOptions {
  actor: PatchActor;
  /**
   * Agent ownership rail (ARCH §7.2): when given, ops touching any other node
   * kind are rejected. The Stay Curator physically cannot patch a transit leg.
   */
  ownership?: readonly NodeKind[];
}

export interface PatchError {
  code: "validation" | "not_found" | "forbidden" | "invariant";
  message: string;
  op_index?: number;
  violations?: InvariantViolation[];
  issues?: unknown;
}

const NODE_SCHEMAS = {
  stop: Stop,
  day: Day,
  block: Block,
  meal: MealSlot,
  stay: StayAssignment,
  leg: TransitLeg,
  line_item: LineItem,
  risk: FragileLeg,
  pretrip: TimelineItem,
  concept: Concept,
  ledger: Ledger,
  packing: PackingList,
} satisfies Record<NodeKind, z.ZodType>;

function schemaFor(kind: NodeKind) {
  return NODE_SCHEMAS[kind];
}

// ── applyPatch ───────────────────────────────────────────────────────────────

export function applyPatch(
  graph: PlanGraph,
  patch: GraphPatch,
  opts: ApplyOptions,
): Result<PlanGraph, PatchError> {
  const parsedOps = z.array(GraphPatchOp).safeParse(patch);
  if (!parsedOps.success) {
    return err({ code: "validation", message: "Malformed patch", issues: parsedOps.error.issues });
  }
  const draft = structuredClone(graph);

  for (const [opIndex, op] of parsedOps.data.entries()) {
    const fail = (code: PatchError["code"], message: string): Result<never, PatchError> =>
      err({ code, message, op_index: opIndex });

    const targetId = op.op === "add_node" ? (op.node as { node_id?: unknown }).node_id : op.node_id;
    if (typeof targetId !== "string") return fail("validation", "Op is missing a node_id");
    const kind = kindOf(targetId);
    if (!kind) return fail("validation", `Malformed node id "${targetId}"`);
    if (opts.ownership && !opts.ownership.includes(kind)) {
      return fail(
        "forbidden",
        `Actor "${opts.actor}" does not own node kind "${kind}" (owns: ${opts.ownership.join(", ")})`,
      );
    }

    const { byId } = indexNodes(draft);

    switch (op.op) {
      case "add_node": {
        if ((SINGLETON_KINDS as readonly string[]).includes(kind)) {
          return fail("validation", `Singleton node kind "${kind}" cannot be added`);
        }
        if (byId.has(targetId as NodeId)) {
          return fail("validation", `Node ${targetId} already exists`);
        }
        const parsed = schemaFor(kind).safeParse(op.node);
        if (!parsed.success) {
          return err({
            code: "validation",
            message: `Invalid ${kind} payload`,
            op_index: opIndex,
            issues: parsed.error.issues,
          });
        }
        if (kind === "block" || kind === "meal") {
          if (!op.parent_ref)
            return fail("validation", `Adding a ${kind} requires parent_ref (a day)`);
          const parent = byId.get(op.parent_ref);
          if (!parent || parent.kind !== "day") {
            return fail("not_found", `Parent day ${op.parent_ref} not found`);
          }
          if (lockOf(parent.node) === "user" && opts.actor !== "user") {
            return fail("forbidden", `Day ${op.parent_ref} is locked by the user`);
          }
        }
        const collection = collectionFor(draft, kind as CollectionKind, op.parent_ref);
        if (!collection) return fail("not_found", `Target collection for ${kind} not found`);
        const index =
          op.index === undefined ? collection.length : Math.min(op.index, collection.length);
        collection.splice(index, 0, parsed.data);
        break;
      }

      case "update_node": {
        const entry = byId.get(op.node_id);
        if (!entry) return fail("not_found", `Node ${op.node_id} not found`);
        if (entry.location.collection === "blocks" && entry.location.index === -1) {
          return fail(
            "validation",
            `Node ${op.node_id} is an embedded alternative; swap it instead`,
          );
        }
        if (lockOf(entry.node) === "user" && opts.actor !== "user") {
          return fail("forbidden", `Node ${op.node_id} is locked by the user`);
        }
        if ("node_id" in op.set || op.unset.includes("node_id")) {
          return fail("validation", "node_id is immutable");
        }
        const updated: Record<string, unknown> = Object.fromEntries(
          Object.entries({ ...entry.node, ...op.set }).filter(([key]) => !op.unset.includes(key)),
        );
        const parsed = schemaFor(entry.kind).safeParse(updated);
        if (!parsed.success) {
          return err({
            code: "validation",
            message: `Update produces an invalid ${entry.kind}`,
            op_index: opIndex,
            issues: parsed.error.issues,
          });
        }
        replaceNode(draft, op.node_id, parsed.data);
        break;
      }

      case "remove_node": {
        const entry = byId.get(op.node_id);
        if (!entry) return fail("not_found", `Node ${op.node_id} not found`);
        if (entry.location.collection === "singleton") {
          return fail("validation", `Singleton node kind "${entry.kind}" cannot be removed`);
        }
        if (entry.location.collection === "blocks" && entry.location.index === -1) {
          return fail("validation", `Node ${op.node_id} is an embedded alternative`);
        }
        if (lockOf(entry.node) === "user" && opts.actor !== "user") {
          return fail("forbidden", `Node ${op.node_id} is locked by the user`);
        }
        const collection = collectionFor(
          draft,
          entry.kind as CollectionKind,
          "parent_ref" in entry.location ? entry.location.parent_ref : undefined,
        );
        if (!collection) return fail("not_found", `Collection for ${op.node_id} not found`);
        collection.splice(entry.location.index, 1);
        break;
      }

      case "move_node": {
        const entry = byId.get(op.node_id);
        if (!entry) return fail("not_found", `Node ${op.node_id} not found`);
        if (entry.location.collection === "singleton") {
          return fail("validation", "Singleton nodes cannot move");
        }
        if (entry.location.collection === "blocks" && entry.location.index === -1) {
          return fail("validation", `Node ${op.node_id} is an embedded alternative`);
        }
        if (lockOf(entry.node) === "user" && opts.actor !== "user") {
          return fail("forbidden", `Node ${op.node_id} is locked by the user`);
        }
        if (op.to_parent_ref && entry.kind !== "block" && entry.kind !== "meal") {
          return fail("validation", `Only blocks/meals can move between parents`);
        }
        const fromParent = "parent_ref" in entry.location ? entry.location.parent_ref : undefined;
        const toParent = op.to_parent_ref ?? fromParent;
        if (op.to_parent_ref) {
          const parent = byId.get(op.to_parent_ref);
          if (!parent || parent.kind !== "day") {
            return fail("not_found", `Target day ${op.to_parent_ref} not found`);
          }
          if (lockOf(parent.node) === "user" && opts.actor !== "user") {
            return fail("forbidden", `Day ${op.to_parent_ref} is locked by the user`);
          }
        }
        const source = collectionFor(draft, entry.kind as CollectionKind, fromParent);
        const target = collectionFor(draft, entry.kind as CollectionKind, toParent);
        if (!source || !target) return fail("not_found", `Collection for ${op.node_id} not found`);
        const [node] = source.splice(entry.location.index, 1);
        if (!node) return fail("not_found", `Node ${op.node_id} vanished mid-move`);
        target.splice(Math.min(op.to_index, target.length), 0, node);
        break;
      }

      case "set_lock": {
        if (opts.actor !== "user") {
          return fail("forbidden", "Only the user can lock or unlock nodes");
        }
        const entry = byId.get(op.node_id);
        if (!entry) return fail("not_found", `Node ${op.node_id} not found`);
        if (lockOf(entry.node) === null) {
          return fail("validation", `Node kind "${entry.kind}" is not lockable`);
        }
        replaceNode(draft, op.node_id, { ...entry.node, locks: op.lock } as AnyNode);
        break;
      }
    }
  }

  const parsed = PlanGraph.safeParse(draft);
  if (!parsed.success) {
    return err({
      code: "validation",
      message: "Patched graph fails schema",
      issues: parsed.error.issues,
    });
  }
  const violations = checkInvariants(parsed.data);
  if (violations.length > 0) {
    return err({ code: "invariant", message: "Patched graph violates invariants", violations });
  }
  return ok(parsed.data);
}

/** In-place node replacement on a draft (works for singletons + collections). */
function replaceNode(draft: PlanGraph, nodeId: NodeId, next: AnyNode): void {
  if (draft.concept.node_id === nodeId) {
    draft.concept = next as PlanGraph["concept"];
    return;
  }
  if (draft.budget.node_id === nodeId) {
    draft.budget = next as PlanGraph["budget"];
    return;
  }
  if (draft.packing.node_id === nodeId) {
    draft.packing = next as PlanGraph["packing"];
    return;
  }
  const replaceIn = (arr: AnyNode[]): boolean => {
    const i = arr.findIndex((n) => (n as { node_id: NodeId }).node_id === nodeId);
    if (i === -1) return false;
    arr[i] = next;
    return true;
  };
  if (replaceIn(draft.route)) return;
  if (replaceIn(draft.days)) return;
  if (replaceIn(draft.stays)) return;
  if (replaceIn(draft.legs)) return;
  if (replaceIn(draft.budget.line_items)) return;
  if (replaceIn(draft.risk)) return;
  if (replaceIn(draft.pretrip)) return;
  for (const day of draft.days) {
    if (replaceIn(day.blocks) || replaceIn(day.meals)) return;
  }
  throw new Error(`replaceNode: ${nodeId} not found (index out of sync)`);
}
