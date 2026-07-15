import { z } from "zod";
import { TransitLeg, BookingInfo } from "@raah/plan-graph";
import type { KnowledgeBase } from "@raah/kb";
import { ModelRouter } from "./router";
import { kbFacts, groundingBlock } from "./grounding";

const EnrichedLegSchema = z.object({
  leg_id: z.string(),
  mode: z.enum(["train", "flight", "car", "bus", "ferry"]),
  operator: z.string().optional(),
  service_ref: z.string().optional(),
  class_options: z.array(z.string()).default([]),
  recommended_class: z.string().optional(),
  booking: z
    .object({
      channel: z.string(),
      waitlist_risk: z.enum(["low", "medium", "high"]).optional(),
    })
    .optional(),
});

export const LogisticsAgentOutputSchema = z.object({
  enriched_legs: z.array(EnrichedLegSchema),
});

export type LogisticsAgentOutput = z.infer<typeof LogisticsAgentOutputSchema>;

export class LogisticsAgent {
  constructor(
    private router: ModelRouter,
    private kb?: KnowledgeBase,
  ) {}

  public async enrichLegs(legs: TransitLeg[]): Promise<TransitLeg[]> {
    if (legs.length === 0) return legs;

    const grounding = this.kb
      ? groundingBlock(kbFacts(this.kb, ["rail-route", "road-realism"], { limit: 15 }))
      : "";
    const promptString = `Given the following transit legs:\n${JSON.stringify(legs, null, 2)}\n\nDetermine operator, service_ref, class_options, recommended_class, and booking information for each leg. Prefer the rail-route facts below over recall for train numbers and booking channels.${grounding}`;

    const { data } = await this.router.generateStructured(
      "curation",
      promptString,
      LogisticsAgentOutputSchema,
      "You are an expert travel logistics planner in India. You provide specific transport details.",
    );

    // Apply enrichment
    const enrichedLegs = [...legs];
    for (const enriched of data.enriched_legs) {
      const leg = enrichedLegs.find((l) => l.node_id === enriched.leg_id);
      if (leg) {
        leg.mode = enriched.mode;
        leg.operator = enriched.operator;
        leg.service_ref = enriched.service_ref;
        leg.class_options = enriched.class_options;
        leg.recommended_class = enriched.recommended_class;
        if (enriched.booking) {
          leg.booking = {
            channel: enriched.booking.channel,
            waitlist_risk: enriched.booking.waitlist_risk,
          } as BookingInfo;
        }
      }
    }

    return enrichedLegs;
  }
}
