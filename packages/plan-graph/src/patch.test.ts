import { describe, expect, it } from "vitest";
import { unwrap } from "@raah/shared/result";
import { newNodeId } from "./ids";
import { checkInvariants } from "./invariants";
import { applyPatch, type GraphPatch } from "./patch";
import { buildGraph, makeBlock, makeMeal, seededIds } from "./testing/builders";

const RAJ = () =>
  buildGraph({
    start: "2026-12-05",
    stops: [
      { name: "Jaipur", region: "rajasthan", nights: 3 },
      { name: "Bundi", region: "rajasthan", nights: 2, legMode: "train" },
    ],
  });

function firstDay(graph = RAJ()) {
  const day = graph.days[0];
  if (!day) throw new Error("fixture has no days");
  return day;
}

describe("applyPatch — basics", () => {
  it("does not mutate the input graph", () => {
    const graph = RAJ();
    const before = JSON.stringify(graph);
    const day = firstDay(graph);
    unwrap(
      applyPatch(
        graph,
        [{ op: "add_node", node: makeBlock(seededIds(7)), parent_ref: day.node_id }],
        { actor: "experience_curator" },
      ),
    );
    expect(JSON.stringify(graph)).toBe(before);
  });

  it("add_node appends a block to a day and inserts at index", () => {
    const graph = RAJ();
    const day = firstDay(graph);
    const block = makeBlock(seededIds(7), { title: "Sunrise at Gaitor" });
    const next = unwrap(
      applyPatch(graph, [{ op: "add_node", node: block, parent_ref: day.node_id, index: 0 }], {
        actor: "experience_curator",
      }),
    );
    expect(next.days[0]?.blocks[0]?.title).toBe("Sunrise at Gaitor");
    expect(next.days[0]?.blocks).toHaveLength(day.blocks.length + 1);
  });

  it("update_node sets and unsets fields, keeps node_id immutable", () => {
    const graph = RAJ();
    const day = firstDay(graph);
    const next = unwrap(
      applyPatch(
        graph,
        [
          {
            op: "update_node",
            node_id: day.node_id,
            set: { theme: "Old city on foot", buffer_notes: "Free after 4pm" },
          },
          { op: "update_node", node_id: day.node_id, set: {}, unset: ["buffer_notes"] },
        ],
        { actor: "experience_curator" },
      ),
    );
    expect(next.days[0]?.theme).toBe("Old city on foot");
    expect(next.days[0]?.buffer_notes).toBeUndefined();

    const bad = applyPatch(
      graph,
      [{ op: "update_node", node_id: day.node_id, set: { node_id: newNodeId("day") } }],
      { actor: "user" },
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("validation");
  });

  it("remove_node and move_node work within a day", () => {
    const graph = RAJ();
    const day = firstDay(graph);
    const [b0, b1] = day.blocks;
    if (!b0 || !b1) throw new Error("fixture needs 2 blocks");
    const next = unwrap(
      applyPatch(
        graph,
        [
          { op: "remove_node", node_id: b0.node_id },
          { op: "move_node", node_id: b1.node_id, to_index: 0 },
        ],
        { actor: "experience_curator" },
      ),
    );
    expect(next.days[0]?.blocks.map((b) => b.node_id)).not.toContain(b0.node_id);
    expect(next.days[0]?.blocks[0]?.node_id).toBe(b1.node_id);
  });

  it("move_node relocates a block across days", () => {
    const graph = RAJ();
    const [d0, d1] = graph.days;
    if (!d0 || !d1) throw new Error("fixture needs 2 days");
    const block = d0.blocks[0];
    if (!block) throw new Error("no block");
    const next = unwrap(
      applyPatch(
        graph,
        [{ op: "move_node", node_id: block.node_id, to_index: 0, to_parent_ref: d1.node_id }],
        { actor: "user" },
      ),
    );
    expect(next.days[0]?.blocks.map((b) => b.node_id)).not.toContain(block.node_id);
    expect(next.days[1]?.blocks[0]?.node_id).toBe(block.node_id);
  });
});

describe("applyPatch — locks (ARCH §5.1)", () => {
  it("user can lock; agents cannot touch locked nodes; user still can", () => {
    const graph = RAJ();
    const stay = graph.stays[0];
    if (!stay) throw new Error("no stay");

    const locked = unwrap(
      applyPatch(graph, [{ op: "set_lock", node_id: stay.node_id, lock: "user" }], {
        actor: "user",
      }),
    );

    const agentWrite = applyPatch(
      locked,
      [{ op: "update_node", node_id: stay.node_id, set: { reasoning: { summary: "changed" } } }],
      { actor: "stay_curator" },
    );
    expect(agentWrite.ok).toBe(false);
    if (!agentWrite.ok) expect(agentWrite.error.code).toBe("forbidden");

    const agentRemove = applyPatch(locked, [{ op: "remove_node", node_id: stay.node_id }], {
      actor: "stay_curator",
    });
    expect(agentRemove.ok).toBe(false);

    const userWrite = applyPatch(
      locked,
      [{ op: "update_node", node_id: stay.node_id, set: { reasoning: { summary: "user says" } } }],
      { actor: "user" },
    );
    expect(userWrite.ok).toBe(true);
  });

  it("only the user may set locks; unlockable kinds rejected", () => {
    const graph = RAJ();
    const stay = graph.stays[0];
    const item = graph.pretrip[0];
    if (!stay || !item) throw new Error("fixture incomplete");
    const agentLock = applyPatch(graph, [{ op: "set_lock", node_id: stay.node_id, lock: "user" }], {
      actor: "stay_curator",
    });
    expect(agentLock.ok).toBe(false);
    const notLockable = applyPatch(
      graph,
      [{ op: "set_lock", node_id: item.node_id, lock: "user" }],
      { actor: "user" },
    );
    expect(notLockable.ok).toBe(false);
  });

  it("agents cannot add into a locked day", () => {
    const graph = RAJ();
    const day = firstDay(graph);
    const locked = unwrap(
      applyPatch(graph, [{ op: "set_lock", node_id: day.node_id, lock: "user" }], {
        actor: "user",
      }),
    );
    const res = applyPatch(
      locked,
      [{ op: "add_node", node: makeMeal(seededIds(9)), parent_ref: day.node_id }],
      { actor: "food_curator" },
    );
    expect(res.ok).toBe(false);
  });
});

describe("applyPatch — ownership rail (ARCH §7.2)", () => {
  it("rejects ops outside the actor's ownership", () => {
    const graph = RAJ();
    const leg = graph.legs[0];
    if (!leg) throw new Error("no leg");
    const res = applyPatch(
      graph,
      [{ op: "update_node", node_id: leg.node_id, set: { operator: "Hacked Rail Co" } }],
      { actor: "stay_curator", ownership: ["stay"] },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("forbidden");

    const allowed = applyPatch(graph, [{ op: "set_lock", node_id: leg.node_id, lock: "user" }], {
      actor: "user",
      ownership: ["leg"],
    });
    expect(allowed.ok).toBe(true);
  });
});

describe("applyPatch — invariants (ARCH §5.3)", () => {
  it("rejects a day whose date falls outside its stop window", () => {
    const graph = RAJ();
    const day = firstDay(graph);
    const res = applyPatch(
      graph,
      [{ op: "update_node", node_id: day.node_id, set: { date: "2027-03-01" } }],
      { actor: "route_optimizer" },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("invariant");
      const invariants = res.error.violations?.map((v) => v.invariant);
      expect(invariants).toContain("day-date-aligned");
    }
  });

  it("rejects removing a stop that legs/days still reference", () => {
    const graph = RAJ();
    const stop = graph.route[1];
    if (!stop) throw new Error("no stop");
    const res = applyPatch(graph, [{ op: "remove_node", node_id: stop.node_id }], {
      actor: "route_optimizer",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("invariant");
  });

  it("rejects a budget line item pointing at a missing node", () => {
    const graph = RAJ();
    const res = applyPatch(
      graph,
      [
        {
          op: "add_node",
          node: {
            node_id: newNodeId("line_item"),
            node_ref: newNodeId("block"), // does not exist
            category: "experiences",
            label: "Ghost entry fee",
            amount: { amount: 500, currency: "INR" },
            confidence: "estimate",
          },
        },
      ],
      { actor: "budget_reconciler" },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.violations?.[0]?.invariant).toBe("line-item-refs");
  });

  it("rejects mismatched alternative kinds", () => {
    const graph = RAJ();
    const day = firstDay(graph);
    const block = day.blocks[0];
    if (!block) throw new Error("no block");
    const alt = makeBlock(seededIds(11), { kind: "rest", title: "Nap instead" });
    const res = applyPatch(
      graph,
      [{ op: "update_node", node_id: block.node_id, set: { alternatives: [alt] } }],
      { actor: "experience_curator" },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.violations?.[0]?.invariant).toBe("alternatives-kind");
  });

  it("rejects duplicate node ids and malformed payloads", () => {
    const graph = RAJ();
    const day = firstDay(graph);
    const existing = day.blocks[0];
    if (!existing) throw new Error("no block");
    const dupe = applyPatch(
      graph,
      [{ op: "add_node", node: { ...existing }, parent_ref: day.node_id }],
      { actor: "experience_curator" },
    );
    expect(dupe.ok).toBe(false);

    const malformed = applyPatch(
      graph,
      [
        {
          op: "add_node",
          node: { node_id: newNodeId("block"), title: "no fields" },
          parent_ref: day.node_id,
        },
      ],
      { actor: "experience_curator" },
    );
    expect(malformed.ok).toBe(false);
  });

  it("singletons cannot be added or removed, but can be updated", () => {
    const graph = RAJ();
    expect(
      applyPatch(graph, [{ op: "remove_node", node_id: graph.concept.node_id }], { actor: "user" })
        .ok,
    ).toBe(false);
    const upd = unwrap(
      applyPatch(
        graph,
        [{ op: "update_node", node_id: graph.concept.node_id, set: { title: "Renamed trip" } }],
        { actor: "concept_architect" },
      ),
    );
    expect(upd.concept.title).toBe("Renamed trip");
  });

  it("fails ops on unknown node ids with not_found", () => {
    const graph = RAJ();
    const res = applyPatch(
      graph,
      [{ op: "update_node", node_id: newNodeId("block"), set: { title: "?" } }],
      { actor: "user" },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("not_found");
  });
});

describe("checkInvariants — strict mode", () => {
  it("golden builder graph is clean in both modes", () => {
    const graph = RAJ();
    expect(checkInvariants(graph)).toEqual([]);
    expect(checkInvariants(graph, { strict: true })).toEqual([]);
  });

  it("strict mode requires full day coverage and stays per stop", () => {
    const graph = RAJ();
    const trimmed: GraphPatch = [
      { op: "remove_node", node_id: graph.days.at(-1)?.node_id ?? "day_x" },
    ];
    const res = applyPatch(graph, trimmed, { actor: "user" });
    // Removing the last day is fine in draft mode…
    expect(res.ok).toBe(true);
    if (res.ok) {
      // …but strict mode flags the coverage gap.
      const strict = checkInvariants(res.value, { strict: true });
      expect(strict.map((v) => v.invariant)).toContain("days-cover-route");
    }
  });
});
