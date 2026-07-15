import { z } from "zod";
import { newNodeId } from "@raah/plan-graph";
import { TravellerProfile } from "@raah/shared/profile";
import { PlanGraph, FragileLeg } from "@raah/plan-graph";
import type { KnowledgeBase } from "@raah/kb";
import { ModelRouter } from "./router";
import { kbFacts, groundingBlock } from "./grounding";

const SimpleFragileLeg = z.object({
  leg_id: z.string(),
  probability: z.number().min(0).max(1),
  cause: z.string(),
  plan_b_summary: z.string(),
});

export const RiskAgentOutputSchema = z.object({
  fragile_legs: z.array(SimpleFragileLeg),
});

export type RiskAgentOutput = z.infer<typeof RiskAgentOutputSchema>;

export class RiskAgent {
  constructor(
    private router: ModelRouter,
    private kb?: KnowledgeBase,
  ) {}

  public async assessRisk(profile: TravellerProfile, graph: PlanGraph): Promise<FragileLeg[]> {
    if (graph.legs.length === 0) return [];

    const grounding = this.kb
      ? groundingBlock(kbFacts(this.kb, ["road-realism", "altitude", "safety-note"], { limit: 15 }))
      : "";
    const promptString = `Given the TravellerProfile:\n${JSON.stringify(profile, null, 2)}\n\nAnd the Transit Legs:\n${JSON.stringify(graph.legs, null, 2)}\n\nIdentify any fragile legs (e.g. waitlist risk, weather disruptions) and provide a probability, cause, and concrete Plan B summary for each. Use the road-realism and altitude facts when judging fragility.${grounding}`;

    const { data } = await this.router.generateStructured(
      "curation",
      promptString,
      RiskAgentOutputSchema,
      "You are an expert travel risk assessor for India.",
    );

    const fragileLegs: FragileLeg[] = [];
    for (const f of data.fragile_legs) {
      fragileLegs.push({
        node_id: newNodeId("risk"),
        target_ref: f.leg_id as any,
        probability: f.probability,
        cause: f.cause,
        plan_b: {
          summary: f.plan_b_summary,
          node_refs: [],
        },
      });
    }

    return fragileLegs;
  }
}
