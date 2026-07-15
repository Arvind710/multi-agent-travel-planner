import { z } from "zod";
import { newNodeId } from "@raah/plan-graph";
import { TravellerProfile } from "@raah/shared/profile";
import { Stop, StayAssignment, Stay } from "@raah/plan-graph";
import type { KnowledgeBase } from "@raah/kb";
import { ModelRouter } from "./router";
import { kbFacts, groundingBlock } from "./grounding";

const SimpleStay = z.object({
  name: z.string(),
  style_tags: z.array(z.string()).default([]),
  area: z.string().optional(),
  price_per_night_inr: z.number().int(),
  cancellation_note: z.string().optional(),
  distance_note: z.string().optional(),
  mobility_note: z.string().optional(),
});

export const StayCuratorOutputSchema = z.object({
  primary: SimpleStay,
  alternates: z.array(SimpleStay).max(2).default([]),
  reasoning_summary: z.string(),
});

export type StayCuratorOutput = z.infer<typeof StayCuratorOutputSchema>;

export class StayCuratorAgent {
  constructor(
    private router: ModelRouter,
    private kb?: KnowledgeBase,
  ) {}

  public async curateStaysForStop(profile: TravellerProfile, stop: Stop): Promise<StayAssignment> {
    const grounding = this.kb
      ? groundingBlock(
          kbFacts(this.kb, ["region", "safety-note"], { region: stop.place.region, limit: 8 }),
        )
      : "";
    const promptString = `Given the TravellerProfile:\n${JSON.stringify(profile, null, 2)}\n\nAnd the Stop:\n${JSON.stringify(stop, null, 2)}\n\nCurate a primary stay and up to 2 alternate stays (e.g. one cheaper, one splurge) that match the profile's taste and budget. Ensure locations make sense for the stop.${grounding}`;

    const { data } = await this.router.generateStructured(
      "curation",
      promptString,
      StayCuratorOutputSchema,
      "You are an expert travel curator specializing in accommodations in India.",
    );

    const mapStay = (s: z.infer<typeof SimpleStay>): Stay => ({
      name: s.name,
      style_tags: s.style_tags,
      area: s.area,
      price_per_night: { currency: "INR", amount: s.price_per_night_inr },
      cancellation_note: s.cancellation_note,
      distance_note: s.distance_note,
      mobility_note: s.mobility_note,
      links: [],
      sources: [],
      verify_flag: true,
    });

    return {
      node_id: newNodeId("stay"),
      stop_ref: stop.node_id as any,
      primary: mapStay(data.primary),
      alternates: data.alternates.map(mapStay),
      reasoning: {
        summary: data.reasoning_summary,
        profile_refs: [],
        tradeoffs_considered: [],
      },
      locks: "none",
    };
  }

  public async curateStays(profile: TravellerProfile, stops: Stop[]): Promise<StayAssignment[]> {
    const assignments: StayAssignment[] = [];
    for (const stop of stops) {
      if (stop.nights > 0) {
        assignments.push(await this.curateStaysForStop(profile, stop));
      }
    }
    return assignments;
  }
}
