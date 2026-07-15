import { describe, it, expect } from "vitest";
import { z } from "zod";
import { TravellerProfile } from "@raah/shared/profile";
import { ConceptsOutputSchema } from "../src/concept-architect";
import { RouteOptimizerOutputSchema } from "../src/route-optimizer";
import { LogisticsAgentOutputSchema } from "../src/logistics-agent";
import { StayCuratorOutputSchema } from "../src/stay-curator";
import { ExperienceCuratorOutputSchema } from "../src/experience-curator";
import { FoodCuratorOutputSchema } from "../src/food-curator";
import { BudgetReconcilerOutputSchema } from "../src/budget-reconciler";
import { RiskAgentOutputSchema } from "../src/risk-agent";
import { CriticOutputSchema } from "../src/critic";
import { NarratorOutputSchema } from "../src/narrator";
import { ClarifierSpecSchema } from "../src/profiler";

/**
 * Every schema handed to generateObject must survive JSON-Schema conversion —
 * z.custom (e.g. plan-graph's nodeIdOf) throws at request time and killed the
 * first live run. LLM-facing schemas stay "Simple" shapes; ids/refs are
 * hydrated in code.
 */
const LLM_FACING: Record<string, z.ZodType> = {
  ConceptsOutputSchema,
  RouteOptimizerOutputSchema,
  LogisticsAgentOutputSchema,
  StayCuratorOutputSchema,
  ExperienceCuratorOutputSchema,
  FoodCuratorOutputSchema,
  BudgetReconcilerOutputSchema,
  RiskAgentOutputSchema,
  CriticOutputSchema,
  NarratorOutputSchema,
  ClarifierSpecSchema,
  TravellerProfile,
};

describe("LLM-facing output schemas", () => {
  for (const [name, schema] of Object.entries(LLM_FACING)) {
    it(`${name} converts to JSON Schema`, () => {
      expect(() => z.toJSONSchema(schema, { io: "output" })).not.toThrow();
    });
  }
});
