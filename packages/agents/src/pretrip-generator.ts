import { newNodeId } from "@raah/plan-graph";
import { TravellerProfile } from "@raah/shared/profile";
import { PlanGraph, TimelineItem, PackingList } from "@raah/plan-graph";
import type { KnowledgeBase } from "@raah/kb";
import { ModelRouter } from "./router";

export class PretripGeneratorAgent {
  constructor(
    private router: ModelRouter,
    private kb?: KnowledgeBase,
  ) {}

  public async generatePretrip(
    profile: TravellerProfile,
    graph: PlanGraph,
  ): Promise<{ pretrip: TimelineItem[]; packing: PackingList }> {
    // Deterministic logic for T-countdown checklist
    const pretrip: TimelineItem[] = [];
    const tripStart = graph.route[0]?.arrive || new Date().toISOString().slice(0, 10);

    // Simple deterministic checks
    // If they have trains, remind 60 days before
    const hasTrains = graph.legs.some((l) => l.mode === "train");
    if (hasTrains) {
      pretrip.push({
        node_id: newNodeId("pretrip"),
        due: tripStart,
        offset_days: 60,
        label: "Book train tickets (IRCTC window opens 60 days prior)",
        kind: "booking",
        tags: ["train", "irctc"],
        refs: [],
        links: [],
      });
    }

    // Deterministic permits from the KB (the P1.8 permit rule keys off these tags)
    if (this.kb) {
      const nationality = profile.constraints.visa.nationality;
      const regions = [
        ...new Set(graph.route.map((s) => s.place.region).filter((r): r is string => !!r)),
      ];
      const seen = new Set<string>();
      for (const region of regions) {
        for (const permit of this.kb.permitsFor(region, nationality)) {
          if (seen.has(permit.permit_id)) continue;
          seen.add(permit.permit_id);
          pretrip.push({
            node_id: newNodeId("pretrip"),
            due: tripStart,
            offset_days: permit.lead_time_days,
            label: `Apply for ${permit.name} (${permit.lead_time_days}d lead) — ${permit.channel}`,
            kind: "permit",
            tags: [`permit:${permit.permit_id}`],
            refs: [],
            links: [],
          });
        }
      }
    }

    // Packing list (Static generation based on rules, simplified for now)
    const packing: PackingList = {
      node_id: newNodeId("packing"),
      items: [
        {
          label: "Universal power adapter",
          reason: "India uses Type C, D, and M sockets",
          tags: ["electronics"],
        },
        { label: "Hand sanitizer & wipes", tags: ["health"] },
      ],
    };

    return { pretrip, packing };
  }
}
