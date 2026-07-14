import { describe, expect, it } from "vitest";
import { unwrap } from "@raah/shared/result";
import { diff, diffToPatches, summarizeDiff } from "./diff";
import { applyPatch } from "./patch";
import { buildGraph, makeBlock, seededIds } from "./testing/builders";

const graph = () =>
  buildGraph({
    start: "2026-12-05",
    stops: [
      { name: "Kochi", region: "kerala", nights: 2 },
      { name: "Munnar", region: "kerala", nights: 2 },
    ],
  });

describe("diff", () => {
  it("empty diff for identical graphs", () => {
    const a = graph();
    const d = diff(a, a);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([]);
    expect(d.moved).toEqual([]);
    expect(d.meta_changed).toEqual([]);
  });

  it("detects added, removed, changed, and moved nodes", () => {
    const a = graph();
    const day = a.days[0];
    const victim = day?.blocks[0];
    const survivor = day?.blocks[1];
    if (!day || !victim || !survivor) throw new Error("fixture incomplete");

    const b = unwrap(
      applyPatch(
        a,
        [
          { op: "remove_node", node_id: victim.node_id },
          {
            op: "add_node",
            node: makeBlock(seededIds(99), { title: "Kathakali evening" }),
            parent_ref: day.node_id,
          },
          { op: "update_node", node_id: survivor.node_id, set: { title: "Fort Kochi walk" } },
          { op: "update_node", node_id: a.concept.node_id, set: { title: "Kerala, slowly" } },
        ],
        { actor: "user" },
      ),
    );

    const d = diff(a, b);
    expect(d.removed.map((r) => r.node_id)).toEqual([victim.node_id]);
    expect(d.added).toHaveLength(1);
    expect(d.added[0]?.parent_ref).toBe(day.node_id);
    const changedIds = d.changed.map((c) => c.node_id);
    expect(changedIds).toContain(survivor.node_id);
    expect(changedIds).toContain(a.concept.node_id);
    const survivorChange = d.changed.find((c) => c.node_id === survivor.node_id);
    expect(survivorChange?.fields.map((f) => f.path)).toEqual(["title"]);
  });

  it("day content change ignores its blocks/meals (they diff as nodes)", () => {
    const a = graph();
    const day = a.days[0];
    const block = day?.blocks[0];
    if (!day || !block) throw new Error("fixture incomplete");
    const b = unwrap(
      applyPatch(a, [{ op: "update_node", node_id: block.node_id, set: { title: "Renamed" } }], {
        actor: "user",
      }),
    );
    const d = diff(a, b);
    expect(d.changed.map((c) => c.node_id)).toEqual([block.node_id]);
  });

  it("detects reorders as moves", () => {
    const a = graph();
    const day = a.days[0];
    const b1 = day?.blocks[1];
    if (!day || !b1) throw new Error("fixture incomplete");
    const b = unwrap(
      applyPatch(a, [{ op: "move_node", node_id: b1.node_id, to_index: 0 }], { actor: "user" }),
    );
    const d = diff(a, b);
    expect(d.moved.map((m) => m.node_id).sort()).toEqual(
      [day.blocks[0]?.node_id, b1.node_id].sort(),
    );
  });
});

describe("diffToPatches round-trip", () => {
  it("applyPatch(a, diffToPatches(diff(a,b))) reproduces b", () => {
    const a = graph();
    const day0 = a.days[0];
    const day1 = a.days[1];
    const block = day0?.blocks[0];
    const meal = day0?.meals[0];
    if (!day0 || !day1 || !block || !meal) throw new Error("fixture incomplete");

    const b = unwrap(
      applyPatch(
        a,
        [
          { op: "remove_node", node_id: meal.node_id },
          { op: "move_node", node_id: block.node_id, to_index: 0, to_parent_ref: day1.node_id },
          {
            op: "add_node",
            node: makeBlock(seededIds(123), { title: "Spice market" }),
            parent_ref: day0.node_id,
            index: 0,
          },
          { op: "update_node", node_id: day1.node_id, set: { theme: "Tea country" } },
          { op: "update_node", node_id: day0.node_id, set: {}, unset: ["theme"] },
        ],
        { actor: "user" },
      ),
    );

    const rebuilt = unwrap(applyPatch(a, diffToPatches(diff(a, b)), { actor: "user" }));
    expect(rebuilt).toEqual(b);
  });
});

describe("summarizeDiff", () => {
  it("renders human-readable hunks with node refs", () => {
    const a = graph();
    const day = a.days[0];
    const block = day?.blocks[0];
    if (!day || !block) throw new Error("fixture incomplete");
    const b = unwrap(
      applyPatch(
        a,
        [
          { op: "remove_node", node_id: block.node_id },
          {
            op: "update_node",
            node_id: a.budget.node_id,
            set: { total: { amount: 99000, currency: "INR" } },
          },
        ],
        { actor: "user" },
      ),
    );
    const hunks = summarizeDiff(diff(a, b), a, b);
    const texts = hunks.map((h) => h.text);
    expect(texts.some((t) => t.startsWith("Removed block") && t.includes("2026-12-05"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Budget total"))).toBe(true);
    for (const hunk of hunks) expect(hunk.node_refs.length).toBeGreaterThan(0);
  });
});
