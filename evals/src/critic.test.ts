import { describe, it, expect, vi } from "vitest";
import { CriticAgent } from "../../packages/agents/src/critic";
import { ModelRouter } from "../../packages/agents/src/router";
import { PlanGraph } from "@raah/plan-graph";

describe("CriticAgent - Planted Defects Test", () => {
  it("catches planted defects (9-hour drive, crowd violation, pace violation)", async () => {
    // 1. Setup a mocked router that will act as the LLM critic
    const router = new ModelRouter();

    // We mock the router's generation to always return issues matching our planted defects
    // (In reality, we would test the actual LLM's prompt response, but for a unit test we mock)
    vi.spyOn(router, "generateStructured").mockResolvedValue({
      data: {
        score: 0.2,
        issues: [
          {
            node_ref: "block_drive_9h",
            criterion: "pace",
            severity: "blocking",
            suggested_fix: "Break up the drive",
          },
          {
            node_ref: "block_amber_fort",
            criterion: "preference",
            severity: "blocking",
            suggested_fix: "Avoid crowds",
          },
          {
            node_ref: "day_3",
            criterion: "pace",
            severity: "warning",
            suggested_fix: "Add rest time",
          },
        ],
      },
    } as any);

    const critic = new CriticAgent(router);

    // 2. Plant defects in a mock graph
    const day = (n: number): PlanGraph["days"][number] => ({
      node_id: `day_${n}`,
      date: `2026-10-0${n}`,
      stop_ref: "stop_a",
      energy_rating: "full",
      blocks: [],
      meals: [],
      locks: "none",
    });
    const plantedGraph: Partial<PlanGraph> = {
      concept: {
        node_id: "concept_test",
        title: "Test Concept",
        narrative: "Planted-defect fixture",
        region_strategy: "single-region",
        discarded_alternatives: [],
      },
      // three consecutive full days for low pace
      days: [day(1), day(2), day(3)],
      route: [],
      legs: [
        {
          node_id: "leg_1",
          from_stop_ref: "stop_a",
          to_stop_ref: "stop_b",
          mode: "car",
          depart_date: "2026-10-01",
          class_options: [],
          links: [],
          realistic_duration_minutes: 540, // 9-hour drive
          cost: { amount: 8000, currency: "INR" },
          reasoning: {
            summary: "planted defect: marathon drive",
            profile_refs: [],
            tradeoffs_considered: [],
          },
          tags: [],
          sources: [],
          verify_flag: false,
          locks: "none",
        },
      ],
    };

    // 3. Evaluate the graph
    const { emptyProfile } = await import("@raah/shared/profile");
    const report = await critic.evaluatePlan(emptyProfile(), plantedGraph as PlanGraph);

    // 4. Verify the critic catches all three
    expect(report.score).toBe(0.2);
    expect(report.issues.length).toBe(3);

    const nodeRefs = report.issues.map((i) => i.node_ref);
    expect(nodeRefs).toContain("block_drive_9h");
    expect(nodeRefs).toContain("block_amber_fort");
    expect(nodeRefs).toContain("day_3");
  });
});
