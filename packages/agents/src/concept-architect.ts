import { z } from "zod";
import { TravellerProfile } from "@raah/shared/profile";
import { Concept, DiscardedAlternative, newNodeId } from "@raah/plan-graph";
import type { KnowledgeBase } from "@raah/kb";
import { ModelRouter } from "./router";
import { kbFacts, groundingBlock } from "./grounding";

// LLM-facing shape: no node_id — nodeIdOf() is a z.custom (unrepresentable in
// JSON Schema for structured output), and ULIDs are minted here, not by the model.
const SimpleConcept = z.object({
  title: z.string().min(1),
  narrative: z.string().min(1),
  region_strategy: z.string().min(1),
  discarded_alternatives: z.array(DiscardedAlternative).default([]),
});

export const ConceptsOutputSchema = z.object({
  concepts: z.array(SimpleConcept).min(1).max(3),
});

export type ConceptsOutput = z.infer<typeof ConceptsOutputSchema>;

export class ConceptArchitectAgent {
  constructor(
    private router: ModelRouter,
    private kb?: KnowledgeBase,
  ) {}

  /**
   * P3.7: Generate trip concepts, grounded in KB region + climate data.
   */
  public async generateConcepts(profile: TravellerProfile): Promise<Concept[]> {
    const grounding = this.kb
      ? groundingBlock(kbFacts(this.kb, ["region", "climate-calendar", "festival"], { limit: 25 }))
      : "";
    const promptString = `Given the following TravellerProfile for a trip to India:\n\n${JSON.stringify(
      profile,
      null,
      2,
    )}\n\nGenerate 1 to 3 distinct high-level trip concepts that satisfy the constraints and tastes. Only propose regions the knowledge base facts support for the travel window. Each concept needs a title, narrative, region_strategy, and optionally discarded_alternatives with honest reasons.${grounding}`;

    const { data } = await this.router.generateStructured(
      "curation",
      promptString,
      ConceptsOutputSchema,
      "You are an expert concept architect for travel in India. You design the structural foundation of a trip.",
    );

    return data.concepts.map((c) => ({ ...c, node_id: newNodeId("concept") }));
  }
}
