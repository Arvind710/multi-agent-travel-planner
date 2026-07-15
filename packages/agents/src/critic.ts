import { z } from "zod";
import { TravellerProfile } from "@raah/shared/profile";
import { PlanGraph } from "@raah/plan-graph";
import { ModelRouter } from "./router";
import { CriticReport } from "./runtime";

export const CriticOutputSchema = z.object({
  score: z.number().min(0).max(1),
  issues: z
    .array(
      z.object({
        node_ref: z.string(),
        criterion: z.string(),
        severity: z.enum(["blocking", "warning"]),
        suggested_fix: z.string(),
      }),
    )
    .default([]),
});

export class CriticAgent {
  constructor(private router: ModelRouter) {}

  public async evaluatePlan(profile: TravellerProfile, graph: PlanGraph): Promise<CriticReport> {
    // 1. Condense the graph to save tokens and focus the LLM on structure/taste
    const condensedGraph = {
      concept: graph.concept.title,
      route: graph.route.map((s) => ({ id: s.node_id, place: s.place.name, nights: s.nights })),
      days: graph.days.map((d) => ({
        id: d.node_id,
        date: d.date,
        energy: d.energy_rating,
        blocks: d.blocks.map((b) => ({
          id: b.node_id,
          title: b.title,
          tags: b.tags,
          duration: b.duration_minutes,
        })),
        meals: d.meals.map((m) => ({ id: m.node_id, venue: m.venue })),
      })),
    };

    const promptString = `Given the TravellerProfile:\n${JSON.stringify(profile, null, 2)}\n\nAnd the condensed Plan:\n${JSON.stringify(condensedGraph, null, 2)}\n\nEvaluate the plan against the profile. Identify any taste mismatches, bad pacing, or logical flaws. Return a score from 0 to 1 and a list of specific issues (if any) indicating the exact node_ref that needs fixing.`;

    const { data } = await this.router.generateStructured(
      "critique", // uses a different policy per ADR
      promptString,
      CriticOutputSchema,
      "You are an expert travel critic. You review plans and find flaws based on the user's profile.",
    );

    return data;
  }
}
