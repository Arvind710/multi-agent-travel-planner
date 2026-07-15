import { z } from "zod";
import { newNodeId } from "@raah/plan-graph";
import { TravellerProfile } from "@raah/shared/profile";
import { Concept, Stop, TransitLeg, ISODateSchema } from "@raah/plan-graph";
import type { KnowledgeBase } from "@raah/kb";
import { ModelRouter } from "./router";
import { kbFacts, groundingBlock } from "./grounding";

const SimplePlaceRef = z.object({
  name: z.string(),
  region: z.string().optional(),
});

const SimpleStop = z.object({
  place: SimplePlaceRef,
  arrive: ISODateSchema,
  depart: ISODateSchema,
  nights: z.number().int(),
  rationale_summary: z.string(),
  rationale_profile_refs: z.array(z.string()).default([]),
});

const SimpleTransitLeg = z.object({
  mode: z.enum(["train", "flight", "car", "bus", "ferry"]),
  depart_date: ISODateSchema,
  arrive_date: ISODateSchema.optional(),
  realistic_duration_minutes: z.number().int(),
  cost_estimate_inr: z.number().int(),
  reasoning_summary: z.string(),
});

export const RouteOptimizerOutputSchema = z.object({
  stops: z.array(SimpleStop),
  legs: z.array(SimpleTransitLeg), // Expect n-1 legs for n stops
});

export type RouteOptimizerOutput = z.infer<typeof RouteOptimizerOutputSchema>;

export class RouteOptimizerAgent {
  constructor(
    private router: ModelRouter,
    private kb?: KnowledgeBase,
  ) {}

  public async optimizeRoute(
    profile: TravellerProfile,
    concept: Concept,
  ): Promise<{ stops: Stop[]; legs: TransitLeg[] }> {
    const grounding = this.kb
      ? groundingBlock(kbFacts(this.kb, ["road-realism", "rail-route", "region"], { limit: 20 }))
      : "";
    const promptString = `Given the TravellerProfile:\n${JSON.stringify(profile, null, 2)}\n\nAnd the Concept:\n${JSON.stringify(concept, null, 2)}\n\nGenerate an ordered list of Stops and the TransitLegs connecting them. Set each stop's place.region to the matching KB region slug. Honour the road-realism facts for durations — mountain roads are far slower than map estimates. The number of legs should be one less than the number of stops.${grounding}`;

    const { data } = await this.router.generateStructured(
      "curation",
      promptString,
      RouteOptimizerOutputSchema,
      "You are an expert travel logistics planner for India. You take high-level concepts and turn them into concrete ordered stops and transit legs.",
    );

    // Hydrate to full domain models
    const stops: Stop[] = [];
    const legs: TransitLeg[] = [];

    for (const s of data.stops) {
      stops.push({
        node_id: newNodeId("stop"),
        place: s.place,
        arrive: s.arrive,
        depart: s.depart,
        nights: s.nights,
        rationale: {
          summary: s.rationale_summary,
          profile_refs: s.rationale_profile_refs,
          tradeoffs_considered: [],
        },
        locks: "none",
      });
    }

    for (let i = 0; i < data.legs.length; i++) {
      const l = data.legs[i];
      const from = stops[i];
      const to = stops[i + 1];
      if (!l || !from || !to) break; // Safeguard: expect n-1 legs

      legs.push({
        node_id: newNodeId("leg"),
        from_stop_ref: from.node_id,
        to_stop_ref: to.node_id,
        mode: l.mode,
        depart_date: l.depart_date,
        arrive_date: l.arrive_date,
        realistic_duration_minutes: l.realistic_duration_minutes,
        cost: { currency: "INR", amount: l.cost_estimate_inr },
        reasoning: {
          summary: l.reasoning_summary,
          profile_refs: [],
          tradeoffs_considered: [],
        },
        class_options: [],
        tags: [],
        sources: [],
        verify_flag: true, // Needs verification as per requirements
        links: [],
        locks: "none",
      });
    }

    return { stops, legs };
  }
}
