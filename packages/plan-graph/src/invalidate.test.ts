import { describe, expect, it } from "vitest";
import { invalidate, isDirty } from "./invalidate";
import { buildGraph } from "./testing/builders";

const graph = () =>
  buildGraph({
    start: "2026-12-05",
    stops: [
      { name: "Jaipur", region: "rajasthan", nights: 2 },
      { name: "Bundi", region: "rajasthan", nights: 2 },
      { name: "Udaipur", region: "rajasthan", nights: 2 },
    ],
  });

describe("invalidate", () => {
  it("stop change dirties its days/blocks/stay/adjacent legs + budget/risk/pretrip/packing", () => {
    const g = graph();
    const bundi = g.route[1];
    if (!bundi) throw new Error("no stop");
    const dirty = invalidate(g, [bundi.node_id]);

    const bundiDays = g.days.filter((d) => d.stop_ref === bundi.node_id);
    expect(bundiDays.length).toBeGreaterThan(0);
    for (const day of bundiDays) {
      expect(isDirty(dirty, day.node_id)).toBe(true);
      for (const b of day.blocks) expect(isDirty(dirty, b.node_id)).toBe(true);
    }
    const stay = g.stays.find((s) => s.stop_ref === bundi.node_id);
    expect(stay && isDirty(dirty, stay.node_id)).toBe(true);
    const touchingLegs = g.legs.filter(
      (l) => l.from_stop_ref === bundi.node_id || l.to_stop_ref === bundi.node_id,
    );
    expect(touchingLegs).toHaveLength(2);
    for (const leg of touchingLegs) expect(isDirty(dirty, leg.node_id)).toBe(true);
    expect(dirty.sections).toEqual(["budget", "risk", "pretrip", "packing"]);

    // …but NOT the other stops' days or stays (targeted, not global).
    const jaipurDay = g.days.find((d) => d.stop_ref === g.route[0]?.node_id);
    expect(jaipurDay && isDirty(dirty, jaipurDay.node_id)).toBe(false);
    const jaipurStay = g.stays.find((s) => s.stop_ref === g.route[0]?.node_id);
    expect(jaipurStay && isDirty(dirty, jaipurStay.node_id)).toBe(false);
  });

  it("block change dirties its day (energy) + budget only", () => {
    const g = graph();
    const day = g.days[0];
    const block = day?.blocks[0];
    if (!day || !block) throw new Error("fixture incomplete");
    const dirty = invalidate(g, [block.node_id]);
    expect(isDirty(dirty, day.node_id)).toBe(true);
    expect(dirty.sections).toEqual(["budget"]);
    const otherDay = g.days[1];
    expect(otherDay && isDirty(dirty, otherDay.node_id)).toBe(false);
  });

  it("leg change dirties budget + risk + pretrip", () => {
    const g = graph();
    const leg = g.legs[0];
    if (!leg) throw new Error("no leg");
    const dirty = invalidate(g, [leg.node_id]);
    expect(dirty.sections).toEqual(["budget", "risk", "pretrip"]);
  });

  it("date_shift dirties everything date-dependent", () => {
    const g = graph();
    const dirty = invalidate(g, { kind: "date_shift" });
    for (const day of g.days) expect(isDirty(dirty, day.node_id)).toBe(true);
    for (const leg of g.legs) expect(isDirty(dirty, leg.node_id)).toBe(true);
    for (const stay of g.stays) expect(isDirty(dirty, stay.node_id)).toBe(true);
    expect(dirty.sections).toEqual(["budget", "risk", "pretrip", "packing"]);
  });

  it("concept change dirties the whole graph", () => {
    const g = graph();
    const dirty = invalidate(g, [g.concept.node_id]);
    for (const stop of g.route) expect(isDirty(dirty, stop.node_id)).toBe(true);
    for (const day of g.days) expect(isDirty(dirty, day.node_id)).toBe(true);
  });

  it("unknown (removed) node id still lands in the set without throwing", () => {
    const g = graph();
    const dirty = invalidate(g, ["block_01JGXQ2V6H8Z9Y7W5T4R3E2Q1A"]);
    expect(dirty.node_ids).toContain("block_01JGXQ2V6H8Z9Y7W5T4R3E2Q1A");
  });

  it("is monotone: invalidate(A ∪ B) ⊇ invalidate(A) ∪ invalidate(B)", () => {
    const g = graph();
    const stop = g.route[0];
    const leg = g.legs[1];
    if (!stop || !leg) throw new Error("fixture incomplete");
    const a = invalidate(g, [stop.node_id]);
    const b = invalidate(g, [leg.node_id]);
    const union = invalidate(g, [stop.node_id, leg.node_id]);
    for (const id of [...a.node_ids, ...b.node_ids]) {
      expect(union.node_ids).toContain(id);
    }
    for (const s of [...a.sections, ...b.sections]) {
      expect(union.sections).toContain(s);
    }
  });
});
