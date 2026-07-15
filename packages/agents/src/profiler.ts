import { z } from "zod";
import { TravellerProfile } from "@raah/shared/profile";
import { ModelRouter } from "./router";
import { parsePrompt } from "./prompts";

export interface Clarifier {
  id: string;
  question: string;
  options: string[];
  asked_because: string;
}

export const ClarifierSpecSchema = z.object({
  clarifiers: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        options: z.array(z.string()),
        asked_because: z.string(),
      }),
    )
    .max(8),
});

export type ClarifierSpec = z.infer<typeof ClarifierSpecSchema>;

export class ProfilerAgent {
  constructor(private router: ModelRouter) {}

  /**
   * P3.5: Parse NL prompt into TravellerProfile
   */
  public async parseNL(input: string): Promise<TravellerProfile> {
    const promptString = parsePrompt.userTemplate({ input });
    const { data } = await this.router.generateStructured(
      "extraction",
      promptString,
      TravellerProfile,
      parsePrompt.system,
    );
    return data;
  }

  /**
   * P3.6: Generate clarifying questions based on profile
   */
  public async generateClarifiers(profile: TravellerProfile): Promise<ClarifierSpec> {
    const promptString = `Given the following TravellerProfile:\n\n${JSON.stringify(
      profile,
      null,
      2,
    )}\n\nIdentify low-confidence or high-impact missing fields and generate up to 8 clarifying questions.`;

    const { data } = await this.router.generateStructured(
      "extraction",
      promptString,
      ClarifierSpecSchema,
      "You are an expert travel profiler for trips to India. Generate clarifying questions to help build a comprehensive travel plan.",
    );
    return data;
  }
}
