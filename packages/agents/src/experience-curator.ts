import { z } from "zod";
import { newNodeId } from "@raah/plan-graph";
import { TravellerProfile } from "@raah/shared/profile";
import { Stop, Day, BlockKind } from "@raah/plan-graph";
import type { KnowledgeBase } from "@raah/kb";
import { ModelRouter } from "./router";
import { kbFacts, groundingBlock } from "./grounding";

const SimpleBlock = z.object({
  kind: BlockKind,
  title: z.string(),
  time_window: z.object({ start: z.string(), end: z.string() }),
  duration_minutes: z.number().int(),
  cost_estimate_inr: z.number().int(),
  reasoning_summary: z.string(),
  insider_notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const SimpleDay = z.object({
  date: z.string(), // ISO date
  theme: z.string().optional(),
  energy_rating: z.enum(["light", "moderate", "full"]),
  buffer_notes: z.string().optional(),
  blocks: z.array(SimpleBlock),
});

export const ExperienceCuratorOutputSchema = z.object({
  days: z.array(SimpleDay),
});

export type ExperienceCuratorOutput = z.infer<typeof ExperienceCuratorOutputSchema>;

export class ExperienceCuratorAgent {
  constructor(
    private router: ModelRouter,
    private kb?: KnowledgeBase,
  ) {}

  public async curateExperiencesForStop(profile: TravellerProfile, stop: Stop): Promise<Day[]> {
    const grounding = this.kb
      ? groundingBlock(
          kbFacts(this.kb, ["monument", "park", "craft-cluster", "festival", "safety-note"], {
            region: stop.place.region,
            limit: 15,
          }),
        )
      : "";
    const promptString = `Given the TravellerProfile:\n${JSON.stringify(profile, null, 2)}\n\nAnd the Stop details:\n${JSON.stringify(stop, null, 2)}\n\nGenerate the Days and their component Blocks (experiences, transit, rest) for this stop. Ensure the pacing matches the profile, use realistic times, and provide insider notes for key experiences. Pay attention to anti-preferences. Respect monument closure days and park closure months from the knowledge base facts.${grounding}`;

    const { data } = await this.router.generateStructured(
      "curation",
      promptString,
      ExperienceCuratorOutputSchema,
      "You are an expert itinerary curator in India. You build rich, balanced days.",
    );

    return data.days.map((d) => ({
      node_id: newNodeId("day"),
      date: d.date,
      stop_ref: stop.node_id as any,
      theme: d.theme,
      energy_rating: d.energy_rating,
      buffer_notes: d.buffer_notes,
      blocks: d.blocks.map((b) => ({
        node_id: newNodeId("block"),
        kind: b.kind,
        time_window: b.time_window,
        title: b.title,
        duration_minutes: b.duration_minutes,
        cost: { currency: "INR", amount: b.cost_estimate_inr },
        reasoning: {
          summary: b.reasoning_summary,
          profile_refs: [],
          tradeoffs_considered: [],
        },
        insider_notes: b.insider_notes,
        tags: b.tags,
        tradeoff_flagged: false,
        sources: [],
        verify_flag: true,
        links: [],
        alternatives: [],
        locks: "none",
      })),
      meals: [], // Meals added by FoodCurator
      locks: "none",
    }));
  }

  public async curateExperiences(profile: TravellerProfile, stops: Stop[]): Promise<Day[]> {
    const allDays: Day[] = [];
    for (const stop of stops) {
      if (stop.nights > 0) {
        const daysForStop = await this.curateExperiencesForStop(profile, stop);
        allDays.push(...daysForStop);
      }
    }
    return allDays;
  }
}
