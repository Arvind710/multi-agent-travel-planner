import { describe, it, expect, vi, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { emptyProfile } from "@raah/shared/profile";
import { safeParsePlanGraph, newNodeId } from "@raah/plan-graph";
import { KnowledgeBase } from "@raah/kb";
import { ModelRouter } from "../src/router";
import { buildPipeline } from "../src/pipeline";
import { ConceptsOutputSchema } from "../src/concept-architect";
import { RouteOptimizerOutputSchema } from "../src/route-optimizer";
import { StayCuratorOutputSchema } from "../src/stay-curator";
import { ExperienceCuratorOutputSchema } from "../src/experience-curator";
import { FoodCuratorOutputSchema } from "../src/food-curator";
import { BudgetReconcilerOutputSchema } from "../src/budget-reconciler";
import { CriticOutputSchema } from "../src/critic";
import { NarratorOutputSchema } from "../src/narrator";

const CONTENT_ROOT = fileURLToPath(new URL("../../../content/kb", import.meta.url));

/** Deterministic LLM: fixtures keyed by each agent's output schema. */
function mockRouter(fixtures: Map<z.ZodType, unknown>) {
  return vi
    .spyOn(ModelRouter.prototype, "generateStructured")
    .mockImplementation(async (_task, _prompt, schema) => {
      const fixture = fixtures.get(schema as z.ZodType);
      if (fixture === undefined) throw new Error(`no fixture for schema in this test`);
      return {
        data: (schema as z.ZodType).parse(fixture),
        usage: { prompt: 10, completion: 10 },
      } as never;
    });
}

const rajasthanFixtures = new Map<z.ZodType, unknown>([
  [
    ConceptsOutputSchema,
    {
      concepts: [
        {
          node_id: newNodeId("concept"),
          title: "Rajasthan in the Cool Season",
          narrative: "Forts, stepwells and desert light at a relaxed pace.",
          region_strategy: "Single region: rajasthan, short hops only.",
          discarded_alternatives: [],
        },
      ],
    },
  ],
  [
    RouteOptimizerOutputSchema,
    {
      stops: [
        {
          place: { name: "Jaipur", region: "rajasthan" },
          arrive: "2026-11-10",
          depart: "2026-11-13",
          nights: 3,
          rationale_summary: "Base for Amber Fort and the old city.",
          rationale_profile_refs: [],
        },
      ],
      legs: [],
    },
  ],
  [
    StayCuratorOutputSchema,
    {
      primary: {
        name: "Haveli near the old city",
        style_tags: ["heritage"],
        price_per_night_inr: 4000,
      },
      alternates: [],
      reasoning_summary: "Heritage stay walkable to the bazaars.",
    },
  ],
  [
    ExperienceCuratorOutputSchema,
    {
      days: [
        {
          date: "2026-11-11",
          theme: "Forts",
          energy_rating: "moderate",
          blocks: [
            {
              kind: "experience",
              title: "Amber Fort at opening time",
              time_window: { start: "08:00", end: "11:00" },
              duration_minutes: 180,
              cost_estimate_inr: 500,
              reasoning_summary: "Beat the heat and the crowds.",
              tags: ["history"],
            },
          ],
        },
      ],
    },
  ],
  [
    FoodCuratorOutputSchema,
    {
      meals: [
        {
          slot: "lunch",
          venue: "LMB, Johari Bazaar",
          dishes: ["dal baati churma"],
          cost_estimate_inr: 400,
          reasoning_summary: "Rajasthani thali institution.",
        },
      ],
    },
  ],
  [BudgetReconcilerOutputSchema, { tradeoffs: [], justification: "Within stated budget." }],
  [CriticOutputSchema, { score: 0.85, issues: [] }],
  [
    NarratorOutputSchema,
    {
      trip_narrative: "Three unhurried days in the pink city.",
      why_callout: ["Cool-season window", "One base, zero repacking"],
      assumptions: [],
    },
  ],
]);

describe("buildPipeline (P3.9 v0, mocked LLM, real KB + rules)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("assembles a schema-valid PlanGraph and grounds prompts in the KB", async () => {
    const spy = mockRouter(rajasthanFixtures);
    const kb = await KnowledgeBase.fromContent(CONTENT_ROOT);
    const pipeline = buildPipeline({ kb });

    const profile = emptyProfile();
    profile.trip.dates.start = "2026-11-10";
    profile.trip.dates.end = "2026-11-13";
    profile.party.adults = 2;

    const config = { configurable: { thread_id: "test-happy" } };
    const final = (await pipeline.invoke(
      {
        profile,
        graph: undefined,
        dirty: "all",
        criticReports: [],
        iteration: 0,
        budgetSpend: { spent: 0, budget: 0, tokens: { prompt: 0, completion: 0 } },
      } as never,
      config,
    )) as { graph: Record<string, unknown>; criticReports: { issues: unknown[] }[] };

    // The worker stamps meta before persisting — mirror that here.
    const parsed = safeParsePlanGraph({
      ...final.graph,
      meta: { trip_id: "trip-test", version: 1, profile_version: 1, status: "validated" },
    });
    expect(parsed.success, JSON.stringify(!parsed.success && parsed.error.issues.slice(0, 5))).toBe(
      true,
    );
    if (!parsed.success) return;
    expect(parsed.data.days.length).toBeGreaterThan(0);
    expect(parsed.data.days[0]!.meals.length).toBeGreaterThan(0);
    expect(parsed.data.budget.total.amount).toBeGreaterThan(0);
    expect(parsed.data.concept.narrative).toContain("pink city");

    // Grounding: curator prompts must carry KB facts, e.g. Amber Fort closures.
    const prompts = spy.mock.calls.map((c) => String(c[1]));
    expect(prompts.some((p) => p.includes("VERIFIED KNOWLEDGE BASE FACTS"))).toBe(true);
    expect(prompts.some((p) => p.includes("amber-fort"))).toBe(true);
  });

  it("rejects Ladakh in January at the constraint re-gate (season window closed)", async () => {
    // Full fixture set so every agent runs — only the destination violates.
    const ladakhFixtures = new Map<z.ZodType, unknown>(rajasthanFixtures);
    ladakhFixtures.set(ConceptsOutputSchema, {
      concepts: [
        {
          node_id: newNodeId("concept"),
          title: "Ladakh Road Trip",
          narrative: "High passes in deep winter.",
          region_strategy: "ladakh",
          discarded_alternatives: [],
        },
      ],
    });
    ladakhFixtures.set(RouteOptimizerOutputSchema, {
      stops: [
        {
          place: { name: "Leh", region: "ladakh" },
          arrive: "2027-01-10",
          depart: "2027-01-14",
          nights: 4,
          rationale_summary: "Base in Leh.",
          rationale_profile_refs: [],
        },
      ],
      legs: [],
    });
    mockRouter(ladakhFixtures);

    const kb = await KnowledgeBase.fromContent(CONTENT_ROOT);
    const pipeline = buildPipeline({ kb });

    const profile = emptyProfile();
    profile.trip.dates.start = "2027-01-10";
    profile.trip.dates.end = "2027-01-14";

    // v0 gates concepts (no stops yet → passes) and re-gates the full graph:
    // the January Ladakh stop must hit the blocking season-window rule there.
    const config = { configurable: { thread_id: "test-ladakh" } };
    await expect(
      pipeline.invoke(
        {
          profile,
          graph: undefined,
          dirty: "all",
          criticReports: [],
          iteration: 0,
          budgetSpend: { spent: 0, budget: 0, tokens: { prompt: 0, completion: 0 } },
        } as never,
        config,
      ),
    ).rejects.toThrow(/constraint validation failed/i);
  });
});
