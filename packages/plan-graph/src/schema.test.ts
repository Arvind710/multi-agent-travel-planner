import { describe, expect, it } from "vitest";
import { isNodeId, isNodeIdOf, kindOf, newNodeId, NODE_KINDS } from "./ids";
import { Block, parsePlanGraph, safeParsePlanGraph } from "./schema";
import { minimalGraph } from "./testing/builders";

describe("node ids", () => {
  it("generates ids in the {kind}_{ulid} scheme for every kind", () => {
    for (const kind of NODE_KINDS) {
      const id = newNodeId(kind);
      expect(isNodeId(id)).toBe(true);
      expect(isNodeIdOf(kind, id)).toBe(true);
      expect(kindOf(id)).toBe(kind);
    }
  });

  it("rejects malformed ids", () => {
    expect(isNodeId("stop_123")).toBe(false); // too short
    expect(isNodeId("hotel_01JGXQ2V6H8Z9Y7W5T4R3E2Q1A")).toBe(false); // unknown kind
    expect(isNodeId("01JGXQ2V6H8Z9Y7W5T4R3E2Q1A")).toBe(false); // no kind prefix
    expect(isNodeIdOf("day", newNodeId("stop"))).toBe(false); // kind mismatch
    expect(kindOf("nonsense")).toBeNull();
  });
});

describe("PlanGraph schema", () => {
  it("parses a minimal valid graph and applies defaults", () => {
    const graph = parsePlanGraph(minimalGraph());
    expect(graph.route).toEqual([]);
    expect(graph.budget.line_items).toEqual([]);
    expect(graph.packing.items).toEqual([]);
    expect(graph.concept.discarded_alternatives).toEqual([]);
  });

  it("rejects a graph with a wrong-kind node id", () => {
    const bad = minimalGraph();
    (bad.concept as { node_id: string }).node_id = newNodeId("stop");
    const result = safeParsePlanGraph(bad);
    expect(result.success).toBe(false);
  });

  it("rejects malformed dates and times", () => {
    const graph = minimalGraph();
    graph.route.push({
      node_id: newNodeId("stop"),
      place: { name: "Jaipur", region: "rajasthan" },
      arrive: "05-12-2026", // not ISO
      depart: "2026-12-09",
      nights: 4,
      rationale: { summary: "Base for the eastern circuit" },
    } as never);
    expect(safeParsePlanGraph(graph).success).toBe(false);
  });

  it("rejects more than 2 alternatives on a block", () => {
    const result = Block.safeParse({
      node_id: newNodeId("block"),
      kind: "experience",
      time_window: { start: "09:00", end: "11:00" },
      title: "City Palace",
      duration_minutes: 120,
      cost: { amount: 700, currency: "INR" },
      reasoning: { summary: "You rated architecture 4/5" },
      alternatives: [1, 2, 3].map((i) => ({
        node_id: newNodeId("block"),
        kind: "experience",
        time_window: { start: "09:00", end: "11:00" },
        title: `Alt ${i}`,
        duration_minutes: 60,
        cost: { amount: 0, currency: "INR" },
        reasoning: { summary: "alt" },
      })),
    });
    expect(result.success).toBe(false);
  });
});
