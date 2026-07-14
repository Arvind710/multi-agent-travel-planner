import type { NodeId, NodeKind } from "./ids";
import type {
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
 * Node index: a uniform, addressable view over the graph's nested structure.
 * Everything the mutation engine, diff, and invalidation do starts here.
 */

export type AnyNode =
  | Concept
  | Stop
  | Day
  | Block
  | MealSlot
  | StayAssignment
  | TransitLeg
  | LineItem
  | Ledger
  | FragileLeg
  | TimelineItem
  | PackingList;

/** Where a node lives inside the graph document. */
export type NodeLocation =
  | { collection: "route" | "days" | "stays" | "legs" | "risk" | "pretrip"; index: number }
  | { collection: "blocks" | "meals"; parent_ref: NodeId<"day">; index: number }
  | { collection: "line_items"; index: number }
  | { collection: "singleton" };

export interface NodeEntry {
  node_id: NodeId;
  kind: NodeKind;
  node: AnyNode;
  location: NodeLocation;
}

/** Kinds that live in graph collections and can be added/removed/moved. */
export const COLLECTION_KINDS = [
  "stop",
  "day",
  "block",
  "meal",
  "stay",
  "leg",
  "line_item",
  "risk",
  "pretrip",
] as const satisfies readonly NodeKind[];

/** Singleton kinds: exactly one per graph; update-only. */
export const SINGLETON_KINDS = [
  "concept",
  "ledger",
  "packing",
] as const satisfies readonly NodeKind[];

export type CollectionKind = (typeof COLLECTION_KINDS)[number];

/**
 * Index every addressable node. Duplicate ids are collected (not thrown) so
 * the invariant checker can report them as violations.
 */
export function indexNodes(graph: PlanGraph): {
  byId: Map<NodeId, NodeEntry>;
  duplicates: NodeId[];
} {
  const byId = new Map<NodeId, NodeEntry>();
  const duplicates: NodeId[] = [];

  const put = (entry: NodeEntry) => {
    if (byId.has(entry.node_id)) duplicates.push(entry.node_id);
    else byId.set(entry.node_id, entry);
  };

  put({
    node_id: graph.concept.node_id,
    kind: "concept",
    node: graph.concept,
    location: { collection: "singleton" },
  });
  put({
    node_id: graph.budget.node_id,
    kind: "ledger",
    node: graph.budget,
    location: { collection: "singleton" },
  });
  put({
    node_id: graph.packing.node_id,
    kind: "packing",
    node: graph.packing,
    location: { collection: "singleton" },
  });

  graph.route.forEach((stop, index) =>
    put({
      node_id: stop.node_id,
      kind: "stop",
      node: stop,
      location: { collection: "route", index },
    }),
  );
  graph.days.forEach((day, index) => {
    put({ node_id: day.node_id, kind: "day", node: day, location: { collection: "days", index } });
    day.blocks.forEach((block, blockIndex) =>
      put({
        node_id: block.node_id,
        kind: "block",
        node: block,
        location: { collection: "blocks", parent_ref: day.node_id, index: blockIndex },
      }),
    );
    day.meals.forEach((meal, mealIndex) =>
      put({
        node_id: meal.node_id,
        kind: "meal",
        node: meal,
        location: { collection: "meals", parent_ref: day.node_id, index: mealIndex },
      }),
    );
  });
  graph.stays.forEach((stay, index) =>
    put({
      node_id: stay.node_id,
      kind: "stay",
      node: stay,
      location: { collection: "stays", index },
    }),
  );
  graph.legs.forEach((leg, index) =>
    put({ node_id: leg.node_id, kind: "leg", node: leg, location: { collection: "legs", index } }),
  );
  graph.budget.line_items.forEach((item, index) =>
    put({
      node_id: item.node_id,
      kind: "line_item",
      node: item,
      location: { collection: "line_items", index },
    }),
  );
  graph.risk.forEach((risk, index) =>
    put({
      node_id: risk.node_id,
      kind: "risk",
      node: risk,
      location: { collection: "risk", index },
    }),
  );
  graph.pretrip.forEach((item, index) =>
    put({
      node_id: item.node_id,
      kind: "pretrip",
      node: item,
      location: { collection: "pretrip", index },
    }),
  );

  // Block alternatives are embedded content, not addressable — but their ids
  // still participate in uniqueness so a swap can never collide.
  for (const day of graph.days) {
    for (const block of day.blocks) {
      for (const alt of block.alternatives) {
        if (byId.has(alt.node_id)) duplicates.push(alt.node_id);
        else
          byId.set(alt.node_id, {
            node_id: alt.node_id,
            kind: "block",
            node: alt as Block,
            location: { collection: "blocks", parent_ref: day.node_id, index: -1 },
          });
      }
    }
  }

  return { byId, duplicates };
}

/** The mutable array a collection-kind node lives in (on a draft copy). */
export function collectionFor(
  graph: PlanGraph,
  kind: CollectionKind,
  parentRef?: NodeId,
): AnyNode[] | null {
  switch (kind) {
    case "stop":
      return graph.route;
    case "day":
      return graph.days;
    case "stay":
      return graph.stays;
    case "leg":
      return graph.legs;
    case "line_item":
      return graph.budget.line_items;
    case "risk":
      return graph.risk;
    case "pretrip":
      return graph.pretrip;
    case "block":
    case "meal": {
      const day = graph.days.find((d) => d.node_id === parentRef);
      if (!day) return null;
      return kind === "block" ? day.blocks : day.meals;
    }
  }
}

/** Lock state of a node, or null when the kind is not lockable. */
export function lockOf(node: AnyNode): LockState | null {
  if ("locks" in node) return node.locks;
  return null;
}
