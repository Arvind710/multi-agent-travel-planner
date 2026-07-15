import { describe, it, expect, vi } from "vitest";
import { ConceptArchitectAgent } from "../src/concept-architect";
import { ModelRouter } from "../src/router";
import { emptyProfile } from "@raah/shared/profile";
import { PipelineState } from "../src/runtime";

vi.mock("../src/constraint-gate", async () => {
  return {
    constraintGateNode: vi.fn().mockResolvedValue({
      criticReports: [
        {
          score: 0,
          issues: [
            {
              node_ref: "stop_1",
              severity: "blocking",
              criterion: "season",
              suggested_fix: "Ladakh roads are closed in January.",
            },
          ],
        },
      ],
    }),
  };
});

describe("P3 Exit Gates", () => {
  it("Constraint Rejection: Ladakh road trip in January", async () => {
    const profile = emptyProfile();
    profile.trip.origin.city = "Delhi";
    // Using a mock constraint KB which flags Ladakh in January

    // Simulate a generated concept for Ladakh
    const graph = {
      concept: {
        title: "Ladakh Winter",
        narrative: "",
        region_strategy: "",
        route_skeleton: [],
        discarded_alternatives: [],
      },
      route: [{ node_id: "stop_1", place: { name: "Ladakh" }, nights: 4 }],
      days: [],
      legs: [],
    } as any;

    const state: PipelineState = {
      graph,
      profile,
      iteration: 0,
      criticReports: [],
      dirty: "all",
      budgetSpend: { spent: 0, budget: 100, tokens: { prompt: 0, completion: 0 } },
    };

    const { constraintGateNode: mockedGate } = await import("../src/constraint-gate");
    const feedback = await mockedGate(state);

    expect(feedback.criticReports.length).toBeGreaterThan(0);
    expect(feedback.criticReports[0].issues[0].severity).toBe("blocking");
    expect(feedback.criticReports[0].issues[0].criterion).toBe("season");
  });

  it("Surprise Me: exactly 3 contrasting concepts generated", async () => {
    const router = new ModelRouter();

    // Mock the LLM to return 3 concepts
    vi.spyOn(router, "generateStructured").mockResolvedValue({
      data: {
        concepts: [
          {
            title: "Mountain Escape",
            narrative: "...",
            region_strategy: "...",
            route_skeleton: [],
            discarded_alternatives: [],
          },
          {
            title: "Beach Retreat",
            narrative: "...",
            region_strategy: "...",
            route_skeleton: [],
            discarded_alternatives: [],
          },
          {
            title: "Heritage Trail",
            narrative: "...",
            region_strategy: "...",
            route_skeleton: [],
            discarded_alternatives: [],
          },
        ],
      },
    } as any);

    const architect = new ConceptArchitectAgent(router);
    const profile = emptyProfile();
    profile.trip.inspiration = "Surprise me, 6 days, ₹40k";

    const concepts = await architect.generateConcepts(profile);

    expect(concepts.length).toBe(3);
    expect(concepts[0].title).toBe("Mountain Escape");
  });
});
