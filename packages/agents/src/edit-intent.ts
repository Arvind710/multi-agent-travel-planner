import { z } from "zod";
import { ModelRouter } from "./router";
import { parseEditIntentPrompt } from "./prompts";

export const PatchIntentSchema = z.object({
  kind: z.enum([
    "lighten_day",
    "swap_stop",
    "add_constraint",
    "extend_trip",
    "regenerate",
    "custom",
    "ambiguous",
  ]),
  confidence: z.number().min(0).max(1),
  // If ambiguous, the agent generates a clarifying question
  clarifying_question: z.string().optional(),
  // Payloads depending on the intent
  payload: z
    .object({
      day_index: z.number().optional(),
      from_stop: z.string().optional(),
      to_stop: z.string().optional(),
      constraint: z.string().optional(),
      days_to_add: z.number().optional(),
      scope: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
});

export type PatchIntent = z.infer<typeof PatchIntentSchema>;

export class EditIntentParser {
  constructor(private router: ModelRouter) {}

  /**
   * P6.1: Parse NL edit message into PatchIntent
   */
  public async parseIntent(input: string): Promise<PatchIntent> {
    const promptString = parseEditIntentPrompt.userTemplate({ input });
    const { data } = await this.router.generateStructured(
      "extraction",
      promptString,
      PatchIntentSchema,
      parseEditIntentPrompt.system,
    );
    return data;
  }
}
