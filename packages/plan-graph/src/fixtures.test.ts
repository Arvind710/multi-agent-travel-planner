import { describe, expect, it } from "vitest";
import goldenKerala from "../fixtures/golden-kerala-7d.json";
import goldenRajasthan from "../fixtures/golden-rajasthan-14d.json";
import { checkInvariants } from "./invariants";
import { parsePlanGraph } from "./schema";
import { buildGoldenKerala7d, buildGoldenRajasthan14d } from "./testing/fixtures";

describe("golden fixtures (P1.5)", () => {
  it("golden-rajasthan-14d.json is schema-valid and invariant-clean (strict)", () => {
    const graph = parsePlanGraph(goldenRajasthan);
    expect(checkInvariants(graph, { strict: true })).toEqual([]);
    expect(graph.route).toHaveLength(4);
    expect(graph.days).toHaveLength(14);
    expect(graph.legs).toHaveLength(3);
  });

  it("golden-kerala-7d.json is schema-valid and invariant-clean (strict)", () => {
    const graph = parsePlanGraph(goldenKerala);
    expect(checkInvariants(graph, { strict: true })).toEqual([]);
    expect(graph.route).toHaveLength(3);
    expect(graph.days).toHaveLength(7);
  });

  it("checked-in JSON matches the deterministic generators (no drift)", () => {
    expect(goldenRajasthan).toEqual(JSON.parse(JSON.stringify(buildGoldenRajasthan14d())));
    expect(goldenKerala).toEqual(JSON.parse(JSON.stringify(buildGoldenKerala7d())));
  });
});
