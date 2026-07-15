import { z } from "zod";
import { newNodeId } from "@raah/plan-graph";
import { TravellerProfile } from "@raah/shared/profile";
import { Day, MealSlot, Stop } from "@raah/plan-graph";
import type { KnowledgeBase } from "@raah/kb";
import { ModelRouter } from "./router";
import { kbFacts, groundingBlock } from "./grounding";

const SimpleMealSlot = z.object({
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  venue: z.string(),
  dishes: z.array(z.string()).default([]),
  fallback_venue: z.string().optional(),
  cost_estimate_inr: z.number().int(),
  reasoning_summary: z.string().optional(),
});

export const FoodCuratorOutputSchema = z.object({
  meals: z.array(SimpleMealSlot),
});

export type FoodCuratorOutput = z.infer<typeof FoodCuratorOutputSchema>;

export class FoodCuratorAgent {
  constructor(
    private router: ModelRouter,
    private kb?: KnowledgeBase,
  ) {}

  public async curateFoodForDay(
    profile: TravellerProfile,
    day: Day,
    region?: string,
  ): Promise<MealSlot[]> {
    const grounding = this.kb
      ? groundingBlock(kbFacts(this.kb, ["food-atlas"], { region, limit: 10 }))
      : "";
    const promptString = `Given the TravellerProfile:\n${JSON.stringify(profile, null, 2)}\n\nAnd the Day details (with blocks):\n${JSON.stringify(day, null, 2)}\n\nSuggest dining options for breakfast, lunch, and dinner (and optionally snack). Ensure suggestions align with the day's geography and the traveller's dietary flags. Provide specific dishes to try, preferring dishes and venues from the food-atlas facts.${grounding}`;

    const { data } = await this.router.generateStructured(
      "curation",
      promptString,
      FoodCuratorOutputSchema,
      "You are an expert food and dining curator in India.",
    );

    return data.meals.map((m) => ({
      node_id: newNodeId("meal"),
      slot: m.slot,
      venue: m.venue,
      dishes: m.dishes,
      fallback_venue: m.fallback_venue,
      diet_flags: [], // Derived from KB ideally
      cost: { currency: "INR", amount: m.cost_estimate_inr },
      reasoning: m.reasoning_summary
        ? {
            summary: m.reasoning_summary,
            profile_refs: [],
            tradeoffs_considered: [],
          }
        : undefined,
      links: [],
      tags: [],
      sources: [],
      verify_flag: true,
      locks: "none",
    }));
  }

  public async curateFood(
    profile: TravellerProfile,
    days: Day[],
    stops: Stop[] = [],
  ): Promise<Day[]> {
    const regionByStop = new Map(stops.map((s) => [s.node_id as string, s.place.region]));
    const enrichedDays = [...days];
    for (const day of enrichedDays) {
      day.meals = await this.curateFoodForDay(profile, day, regionByStop.get(day.stop_ref));
    }
    return enrichedDays;
  }
}
