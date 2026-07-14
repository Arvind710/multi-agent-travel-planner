import { describe, expect, it } from "vitest";
import { unwrap } from "@raah/shared/result";
import { diff, diffToPatches, summarizeDiff } from "./diff";
import { newNodeId } from "./ids";
import { invalidate, isDirty } from "./invalidate";
import { checkInvariants } from "./invariants";
import { collectionFor, indexNodes } from "./nodes";
import { applyPatch, type GraphPatch } from "./patch";
import type { PlanGraph } from "./schema";
import { buildGraph, makeBlock, makeStay, seededIds } from "./testing/builders";

/** Error-path and edge-case coverage for the engine (P1.2–P1.4). */

const graph = () =>
  buildGraph({
    start: "2026-12-05",
    stops: [
      { name: "Jaipur", region: "rajasthan", nights: 2 },
      { name: "Bundi", region: "rajasthan", nights: 2, legMode: "train" },
    ],
  });

function expectError(res: ReturnType<typeof applyPatch>, code: string, match?: RegExp) {
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.error.code).toBe(code);
    if (match) expect(res.error.message).toMatch(match);
  }
}

describe("applyPatch — validation edges", () => {
  it("rejects a malformed patch document", () => {
    const res = applyPatch(graph(), [{ op: "explode" }] as unknown as GraphPatch, {
      actor: "user",
    });
    expectError(res, "validation", /Malformed patch/);
  });

  it("rejects ops with missing or malformed node ids", () => {
    expectError(
      applyPatch(graph(), [{ op: "add_node", node: { title: "no id" } }], { actor: "user" }),
      "validation",
      /missing a node_id/,
    );
    expectError(
      applyPatch(graph(), [{ op: "add_node", node: { node_id: "hotel_zzz" } }], { actor: "user" }),
      "validation",
      /Malformed node id/,
    );
  });

  it("rejects adding singletons and adding blocks without/with bad parents", () => {
    const g = graph();
    expectError(
      applyPatch(g, [{ op: "add_node", node: { ...g.concept, node_id: newNodeId("concept") } }], {
        actor: "user",
      }),
      "validation",
      /Singleton/,
    );
    const block = makeBlock(seededIds(5));
    expectError(
      applyPatch(g, [{ op: "add_node", node: block }], { actor: "user" }),
      "validation",
      /requires parent_ref/,
    );
    expectError(
      applyPatch(g, [{ op: "add_node", node: block, parent_ref: g.route[0]?.node_id }], {
        actor: "user",
      }),
      "not_found",
      /Parent day/,
    );
  });

  it("rejects remove/move/set_lock on unknown nodes", () => {
    const g = graph();
    expectError(
      applyPatch(g, [{ op: "remove_node", node_id: newNodeId("block") }], { actor: "user" }),
      "not_found",
    );
    expectError(
      applyPatch(g, [{ op: "move_node", node_id: newNodeId("block"), to_index: 0 }], {
        actor: "user",
      }),
      "not_found",
    );
    expectError(
      applyPatch(g, [{ op: "set_lock", node_id: newNodeId("stay"), lock: "user" }], {
        actor: "user",
      }),
      "not_found",
    );
  });

  it("rejects moving singletons, cross-parent moves of non-blocks, and bad target days", () => {
    const g = graph();
    expectError(
      applyPatch(g, [{ op: "move_node", node_id: g.concept.node_id, to_index: 0 }], {
        actor: "user",
      }),
      "validation",
      /Singleton/,
    );
    const stay = g.stays[0];
    const day = g.days[0];
    if (!stay || !day) throw new Error("fixture incomplete");
    expectError(
      applyPatch(
        g,
        [{ op: "move_node", node_id: stay.node_id, to_index: 0, to_parent_ref: day.node_id }],
        { actor: "user" },
      ),
      "validation",
      /Only blocks\/meals/,
    );
    const block = day.blocks[0];
    if (!block) throw new Error("no block");
    expectError(
      applyPatch(
        g,
        [{ op: "move_node", node_id: block.node_id, to_index: 0, to_parent_ref: newNodeId("day") }],
        { actor: "user" },
      ),
      "not_found",
      /Target day/,
    );
  });

  it("embedded alternatives are not directly patchable", () => {
    const g = graph();
    const day = g.days[0];
    const block = day?.blocks[0];
    if (!day || !block) throw new Error("fixture incomplete");
    const alt = makeBlock(seededIds(21), { title: "Alt option" });
    const withAlt = unwrap(
      applyPatch(g, [{ op: "update_node", node_id: block.node_id, set: { alternatives: [alt] } }], {
        actor: "user",
      }),
    );
    expectError(
      applyPatch(withAlt, [{ op: "update_node", node_id: alt.node_id, set: { title: "hack" } }], {
        actor: "user",
      }),
      "validation",
      /embedded alternative/,
    );
    expectError(
      applyPatch(withAlt, [{ op: "remove_node", node_id: alt.node_id }], { actor: "user" }),
      "validation",
      /embedded alternative/,
    );
    expectError(
      applyPatch(withAlt, [{ op: "move_node", node_id: alt.node_id, to_index: 0 }], {
        actor: "user",
      }),
      "validation",
      /embedded alternative/,
    );
  });

  it("update that fails the node schema reports issues", () => {
    const g = graph();
    const leg = g.legs[0];
    if (!leg) throw new Error("no leg");
    const res = applyPatch(
      g,
      [{ op: "update_node", node_id: leg.node_id, set: { mode: "teleport" } }],
      { actor: "user" },
    );
    expectError(res, "validation", /invalid leg/);
    if (!res.ok) expect(res.error.issues).toBeDefined();
  });

  it("update_node on a moved-out day and ledger/packing singletons works", () => {
    const g = graph();
    const updated = unwrap(
      applyPatch(
        g,
        [
          {
            op: "update_node",
            node_id: g.packing.node_id,
            set: { items: [{ label: "Wool layers", tags: [] }] },
          },
          {
            op: "update_node",
            node_id: g.budget.node_id,
            set: { total: { amount: 1, currency: "INR" } },
          },
        ],
        { actor: "user" },
      ),
    );
    expect(updated.packing.items[0]?.label).toBe("Wool layers");
    expect(updated.budget.total.amount).toBe(1);
  });
});

describe("invariants — corrupted graph detection", () => {
  it("flags depart-before-arrive, nights drift, and route chain breaks", () => {
    const g = graph();
    const corrupt = structuredClone(g) as PlanGraph;
    const s0 = corrupt.route[0];
    const s1 = corrupt.route[1];
    if (!s0 || !s1) throw new Error("fixture incomplete");
    s0.depart = "2026-12-01"; // before arrive
    s1.arrive = "2026-12-25"; // chain break
    const inv = checkInvariants(corrupt).map((v) => v.invariant);
    expect(inv).toContain("route-chronology");
  });

  it("flags nights mismatch", () => {
    const corrupt = structuredClone(graph()) as PlanGraph;
    const s0 = corrupt.route[0];
    if (!s0) throw new Error("no stop");
    s0.nights = 9;
    expect(checkInvariants(corrupt).map((v) => v.invariant)).toContain("stop-nights-math");
  });

  it("flags duplicate day dates and gaps", () => {
    const dup = structuredClone(graph()) as PlanGraph;
    const d1 = dup.days[1];
    const d0 = dup.days[0];
    if (!d0 || !d1) throw new Error("fixture incomplete");
    d1.date = d0.date;
    expect(checkInvariants(dup).map((v) => v.invariant)).toContain("days-contiguous");

    const gap = structuredClone(graph()) as PlanGraph;
    gap.days.splice(1, 1); // hole in the middle
    expect(checkInvariants(gap).map((v) => v.invariant)).toContain("days-contiguous");
  });

  it("flags days referencing missing stops and non-adjacent legs", () => {
    const corrupt = structuredClone(graph()) as PlanGraph;
    const day = corrupt.days[0];
    const leg = corrupt.legs[0];
    if (!day || !leg) throw new Error("fixture incomplete");
    day.stop_ref = newNodeId("stop");
    leg.to_stop_ref = leg.from_stop_ref;
    const inv = checkInvariants(corrupt).map((v) => v.invariant);
    expect(inv).toContain("refs-exist");
    expect(inv).toContain("legs-adjacency");
  });

  it("flags leg departing outside the transfer window and missing fallback", () => {
    const corrupt = structuredClone(graph()) as PlanGraph;
    const leg = corrupt.legs[0];
    if (!leg) throw new Error("no leg");
    leg.depart_date = "2026-12-01";
    leg.fallback_ref = newNodeId("risk");
    const inv = checkInvariants(corrupt).map((v) => v.invariant);
    expect(inv).toContain("legs-adjacency");
    expect(inv).toContain("refs-exist");
  });

  it("flags duplicate stays per stop and dangling stay/risk/pretrip refs", () => {
    const corrupt = structuredClone(graph()) as PlanGraph;
    const stay = corrupt.stays[0];
    if (!stay) throw new Error("no stay");
    corrupt.stays.push({ ...structuredClone(stay), node_id: newNodeId("stay") });
    const dangling = structuredClone(graph()) as PlanGraph;
    const s2 = dangling.stays[0];
    const r0 = dangling.risk[0];
    const p0 = dangling.pretrip[0];
    if (!s2 || !r0 || !p0) throw new Error("fixture incomplete");
    s2.stop_ref = newNodeId("stop");
    r0.target_ref = newNodeId("leg");
    p0.refs = [newNodeId("block")];
    expect(checkInvariants(corrupt).map((v) => v.invariant)).toContain("one-stay-per-stop");
    const inv = checkInvariants(dangling).map((v) => v.invariant);
    expect(inv.filter((i) => i === "refs-exist").length).toBeGreaterThanOrEqual(3);
  });

  it("strict mode flags a stop with nights but no stay", () => {
    const corrupt = structuredClone(graph()) as PlanGraph;
    corrupt.stays.splice(0, 1);
    corrupt.budget.line_items = corrupt.budget.line_items.filter(
      (li) => !li.node_ref.startsWith("stay_"),
    );
    expect(checkInvariants(corrupt, { strict: true }).map((v) => v.invariant)).toContain(
      "stay-per-stop",
    );
  });

  it("flags duplicate node ids", () => {
    const corrupt = structuredClone(graph()) as PlanGraph;
    const day = corrupt.days[0];
    const b0 = day?.blocks[0];
    const b1 = day?.blocks[1];
    if (!day || !b0 || !b1) throw new Error("fixture incomplete");
    b1.node_id = b0.node_id;
    expect(checkInvariants(corrupt).map((v) => v.invariant)).toContain("unique-node-ids");
  });
});

describe("diff/summarize — remaining shapes", () => {
  it("summarizes stays, legs, pretrip, line items, moves and meta changes", () => {
    const a = graph();
    const stay = a.stays[0];
    const leg = a.legs[0];
    const pretrip = a.pretrip[0];
    const li = a.budget.line_items[0];
    const day0 = a.days[0];
    const day1 = a.days[1];
    const block = day0?.blocks[0];
    if (!stay || !leg || !pretrip || !li || !day0 || !day1 || !block)
      throw new Error("fixture incomplete");

    const b = unwrap(
      applyPatch(
        a,
        [
          {
            op: "update_node",
            node_id: stay.node_id,
            set: { primary: makeStay({ name: "Swapped Haveli" }) },
          },
          { op: "update_node", node_id: leg.node_id, set: { operator: "RTDC" } },
          { op: "remove_node", node_id: pretrip.node_id },
          { op: "update_node", node_id: li.node_id, set: { label: "Renamed line" } },
          { op: "move_node", node_id: block.node_id, to_index: 0, to_parent_ref: day1.node_id },
        ],
        { actor: "user" },
      ),
    );
    const d = diff(a, b);
    const texts = summarizeDiff(d, a, b).map((h) => h.text);
    expect(texts.some((t) => t.includes("stay"))).toBe(true);
    expect(texts.some((t) => t.includes("transit leg"))).toBe(true);
    expect(texts.some((t) => t.includes("pre-trip item"))).toBe(true);
    expect(texts.some((t) => t.includes("budget line"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Moved block"))).toBe(true);

    // meta change detection
    const metaChanged = structuredClone(b) as PlanGraph;
    metaChanged.meta.version = 2;
    expect(diff(b, metaChanged).meta_changed.map((f) => f.path)).toEqual(["meta.version"]);
  });

  it("summarizes stop and day additions", () => {
    const a = buildGraph({
      start: "2026-12-05",
      stops: [{ name: "Jaipur", region: "rajasthan", nights: 2 }],
    });
    const b = buildGraph({
      start: "2026-12-05",
      stops: [{ name: "Jaipur", region: "rajasthan", nights: 3 }],
    });
    // different ids everywhere → everything added/removed; exercise those paths
    const d = diff(a, b);
    expect(d.added.length).toBeGreaterThan(0);
    expect(d.removed.length).toBeGreaterThan(0);
    const texts = summarizeDiff(d, a, b).map((h) => h.text);
    expect(texts.some((t) => t.includes("stop"))).toBe(true);
    expect(texts.some((t) => t.includes("day"))).toBe(true);
  });

  it("diffToPatches on cross-version graphs is exact even for full replacement", () => {
    const a = graph();
    const c = structuredClone(a) as PlanGraph;
    // heavy edit: drop last day + its references, rename everything
    const lastDay = c.days.at(-1);
    if (!lastDay) throw new Error("no day");
    c.days.pop();
    const s1 = c.route[1];
    if (!s1) throw new Error("no stop");
    s1.depart = "2026-12-08";
    s1.nights = 1;
    const rebuilt = unwrap(applyPatch(a, diffToPatches(diff(a, c)), { actor: "user" }));
    expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(c));
  });
});

describe("nodes/invalidate — remaining edges", () => {
  it("collectionFor returns null for blocks of unknown days", () => {
    expect(collectionFor(graph(), "block", newNodeId("day"))).toBeNull();
    expect(collectionFor(graph(), "meal", undefined)).toBeNull();
  });

  it("indexNodes flags duplicate alternative ids", () => {
    const g = graph();
    const day = g.days[0];
    const b0 = day?.blocks[0];
    const b1 = day?.blocks[1];
    if (!day || !b0 || !b1) throw new Error("fixture incomplete");
    const alt = makeBlock(seededIds(33));
    b0.alternatives = [alt];
    b1.alternatives = [structuredClone(alt)];
    expect(indexNodes(g).duplicates).toContain(alt.node_id);
  });

  it("node_change intent equals passing ids; ledger/risk/pretrip/packing seeds map to sections", () => {
    const g = graph();
    const stop = g.route[0];
    if (!stop) throw new Error("no stop");
    expect(invalidate(g, { kind: "node_change", node_ids: [stop.node_id] })).toEqual(
      invalidate(g, [stop.node_id]),
    );
    expect(invalidate(g, [g.budget.node_id]).sections).toEqual(["budget"]);
    expect(invalidate(g, [g.packing.node_id]).sections).toEqual(["packing"]);
    const risk = g.risk[0];
    const pre = g.pretrip[0];
    const meal = g.days[0]?.meals[0];
    const li = g.budget.line_items[0];
    if (!risk || !pre || !meal || !li) throw new Error("fixture incomplete");
    expect(invalidate(g, [risk.node_id]).sections).toEqual(["risk"]);
    expect(invalidate(g, [pre.node_id]).sections).toEqual(["pretrip"]);
    expect(invalidate(g, [meal.node_id]).sections).toEqual(["budget"]);
    const liDirty = invalidate(g, [li.node_id]);
    expect(liDirty.sections).toEqual(["budget"]);
    expect(isDirty(liDirty, g.budget.node_id)).toBe(true);
  });
});
