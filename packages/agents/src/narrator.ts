import { z } from "zod";
import { TravellerProfile } from "@raah/shared/profile";
import { PlanGraph } from "@raah/plan-graph";
import { ModelRouter } from "./router";

export const NarratorOutputSchema = z.object({
  trip_narrative: z.string(),
  why_callout: z.array(z.string()).min(1),
  assumptions: z.array(z.string()).default([]),
});

export class NarratorAgent {
  constructor(private router: ModelRouter) {}

  public async generateNarrative(profile: TravellerProfile, graph: PlanGraph) {
    // Collect inferred/default profile fields to explain assumptions
    const inferredFields = Object.entries(profile.provenance)
      .filter(([_, source]) => source === "inferred_from_edit" || source === "default")
      .map(([key]) => key);

    const promptString = `Given the TravellerProfile:\n${JSON.stringify(profile, null, 2)}\n\nAnd the completed PlanGraph Concept:\n${JSON.stringify(graph.concept, null, 2)}\n\nWe inferred these fields: ${inferredFields.join(", ")}.\n\nGenerate a compelling trip narrative (1-2 paragraphs), a "Why this trip" callout summarizing 5-8 major decisions, and a friendly list of assumptions we made (if any) based on the inferred fields. Write in the target language: ${profile.output_prefs.language}.`;

    const { data } = await this.router.generateStructured(
      "curation",
      promptString,
      NarratorOutputSchema,
      "You are an expert travel writer and narrator. Your tone is inspiring but honest.",
    );

    // Apply the narrative directly to the graph concept
    const updatedGraph = { ...graph };
    updatedGraph.concept.narrative = data.trip_narrative;
    // Note: We might store the why_callout and assumptions somewhere else, or add them to concept
    // For now, return them to be added to the state or graph meta
    return {
      narrative: data.trip_narrative,
      why_callout: data.why_callout,
      assumptions: data.assumptions,
    };
  }
}
