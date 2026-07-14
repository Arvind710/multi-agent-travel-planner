import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { unwrap } from "@raah/shared/result";
import { diff, diffToPatches } from "./diff";
import { invalidate } from "./invalidate";
import { checkInvariants } from "./invariants";
import { indexNodes } from "./nodes";
import { applyPatch, type GraphPatch } from "./patch";
import {
  buildGraph,
  makeBlock,
  makeMeal,
  seededIds,
  type BuildGraphSpec,
} from "./testing/builders";
import type { PlanGraph } from "./schema";

/**
 * Property tests (P1.5): apply/diff round-trip, invariants under arbitrary
 * valid patch sequences, DirtySet monotonicity, ID stability.
 * FC_NUM_RUNS: 1k on PR CI, 10k nightly (default kept fast for local loops).
 */
const NUM_RUNS = Number(process.env.FC_NUM_RUNS ?? 100);

// ── graph arbitrary ──────────────────────────────────────────────────────────

const CITY_POOL = [
  { name: "Jaipur", region: "rajasthan" },
  { name: "Bundi", region: "rajasthan" },
  { name: "Udaipur", region: "rajasthan" },
  { name: "Kochi", region: "kerala" },
  { name: "Munnar", region: "kerala" },
];

const graphSpecArb: fc.Arbitrary<BuildGraphSpec> = fc
  .record({
    seed: fc.integer({ min: 1, max: 1_000_000 }),
    stopCount: fc.integer({ min: 1, max: 3 }),
    nights: fc.array(fc.integer({ min: 1, max: 3 }), { minLength: 3, maxLength: 3 }),
    blocksPerDay: fc.integer({ min: 1, max: 2 }),
  })
  .map(({ seed, stopCount, nights, blocksPerDay }) => ({
    start: "2026-11-01",
    ids: seededIds(seed),
    blocksPerDay,
    stops: CITY_POOL.slice(0, stopCount).map((city, i) => ({
      ...city,
      nights: nights[i] ?? 1,
      legMode: i % 2 === 0 ? ("car" as const) : ("train" as const),
    })),
  }));

const graphArb: fc.Arbitrary<PlanGraph> = graphSpecArb.map(buildGraph);

// ── valid-op generation from graph state ─────────────────────────────────────

/**
 * Derives a valid op from the current graph using a random int stream —
 * ops are valid by construction, so every apply must succeed.
 */
function deriveOp(graph: PlanGraph, rand: number[], step: number): GraphPatch[number] | null {
  const pick = <T>(arr: T[], r: number): T | undefined =>
    arr.length === 0 ? undefined : arr[r % arr.length];
  const r = (i: number) => rand[(step * 7 + i) % rand.length] ?? 0;

  const days = graph.days;
  const day = pick(days, r(0));
  if (!day) return null;
  const blocks = days.flatMap((d) => d.blocks.map((b) => ({ day: d, block: b })));

  switch (r(1) % 6) {
    case 0: {
      // add a block (fresh ids derived from the random stream)
      const ids = seededIds(r(2) + step * 31 + 7_000_000);
      return {
        op: "add_node",
        node: makeBlock(ids, { title: `Generated block ${step}` }),
        parent_ref: day.node_id,
        index: r(3) % (day.blocks.length + 1),
      };
    }
    case 1: {
      const ids = seededIds(r(2) + step * 37 + 8_000_000);
      return {
        op: "add_node",
        node: makeMeal(ids, { venue: `Generated venue ${step}` }),
        parent_ref: day.node_id,
      };
    }
    case 2: {
      const target = pick(blocks, r(2));
      if (!target) return null;
      return {
        op: "update_node",
        node_id: target.block.node_id,
        set: { title: `Renamed ${step}`, duration_minutes: 30 + (r(3) % 180) },
      };
    }
    case 3: {
      // remove a block, but never the last one overall (keeps later ops possible)
      if (blocks.length <= 1) return null;
      const target = pick(blocks, r(2));
      if (!target) return null;
      return { op: "remove_node", node_id: target.block.node_id };
    }
    case 4: {
      const target = pick(blocks, r(2));
      if (!target) return null;
      const toDay = pick(days, r(3));
      if (!toDay) return null;
      const targetLen = toDay.blocks.length;
      return {
        op: "move_node",
        node_id: target.block.node_id,
        to_index: targetLen === 0 ? 0 : r(4) % (targetLen + 1),
        to_parent_ref: toDay.node_id,
      };
    }
    default: {
      const stay = pick(graph.stays, r(2));
      if (!stay) return null;
      return { op: "set_lock", node_id: stay.node_id, lock: r(3) % 2 === 0 ? "user" : "none" };
    }
  }
}

const opStreamArb = fc.record({
  spec: graphSpecArb,
  rand: fc.array(fc.nat({ max: 1_000_000 }), { minLength: 24, maxLength: 24 }),
  steps: fc.integer({ min: 1, max: 6 }),
});

function runOps(
  spec: BuildGraphSpec,
  rand: number[],
  steps: number,
): { a: PlanGraph; b: PlanGraph } {
  const a = buildGraph(spec);
  let b = a;
  for (let step = 0; step < steps; step++) {
    const op = deriveOp(b, rand, step);
    if (!op) continue;
    b = unwrap(applyPatch(b, [op], { actor: "user" }));
  }
  return { a, b };
}

// ── properties ───────────────────────────────────────────────────────────────

describe(`plan-graph properties (${NUM_RUNS} runs)`, () => {
  it("built graphs always satisfy schema + invariants (strict)", () => {
    fc.assert(
      fc.property(graphArb, (graph) => {
        expect(checkInvariants(graph, { strict: true })).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("invariants are never violated by generated patch sequences", () => {
    fc.assert(
      fc.property(opStreamArb, ({ spec, rand, steps }) => {
        const { b } = runOps(spec, rand, steps);
        expect(checkInvariants(b)).toEqual([]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("apply/diff round-trip: applyPatch(a, diffToPatches(diff(a,b))) ≡ b", () => {
    fc.assert(
      fc.property(opStreamArb, ({ spec, rand, steps }) => {
        const { a, b } = runOps(spec, rand, steps);
        const rebuilt = unwrap(applyPatch(a, diffToPatches(diff(a, b)), { actor: "user" }));
        expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(b));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("node IDs are stable across versions: surviving nodes keep their ids", () => {
    fc.assert(
      fc.property(opStreamArb, ({ spec, rand, steps }) => {
        const { a, b } = runOps(spec, rand, steps);
        const aIds = new Set(indexNodes(a).byId.keys());
        const bIds = new Set(indexNodes(b).byId.keys());
        const d = diff(a, b);
        const removed = new Set(d.removed.map((r) => r.node_id));
        const added = new Set(d.added.map((x) => x.node_id));
        for (const id of aIds) {
          if (!removed.has(id)) expect(bIds.has(id)).toBe(true);
        }
        for (const id of bIds) {
          if (!added.has(id)) expect(aIds.has(id)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("DirtySet is monotone: invalidate(A ∪ B) ⊇ invalidate(A) ∪ invalidate(B)", () => {
    fc.assert(
      fc.property(
        graphArb,
        fc.array(fc.nat({ max: 10_000 }), { minLength: 2, maxLength: 6 }),
        (graph, picks) => {
          const allIds = [...indexNodes(graph).byId.keys()];
          const chosen = picks.map((p) => allIds[p % allIds.length]).filter((x) => x !== undefined);
          const mid = Math.ceil(chosen.length / 2);
          const setA = chosen.slice(0, mid);
          const setB = chosen.slice(mid);
          const dA = invalidate(graph, setA);
          const dB = invalidate(graph, setB);
          const dU = invalidate(graph, chosen);
          const union = new Set(dU.node_ids);
          for (const id of [...dA.node_ids, ...dB.node_ids]) {
            expect(union.has(id)).toBe(true);
          }
          const unionSections = new Set(dU.sections);
          for (const s of [...dA.sections, ...dB.sections]) {
            expect(unionSections.has(s)).toBe(true);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
