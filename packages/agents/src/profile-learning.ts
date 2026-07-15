import { z } from "zod";
import { ModelRouter } from "./router";
import { parseProfileLearningPrompt } from "./prompts";

// We make a Partial schema for TravellerProfile to allow returning only what changed
// For simplicity in zod, we can just use the partial form of the profile schema if it was a zod schema,
// but since TravellerProfile is a class or type, we can return a subset. We can define a generic partial schema or use TravellerProfile directly with optional fields.
// In @raah/shared/profile, let's assume TravellerProfile is a type.
// We'll define a learning delta schema.
export const ProfileLearningDeltaSchema = z.object({
  deltas: z.array(
    z.object({
      field_path: z.string(),
      value: z.any(),
      reason: z.string(),
    }),
  ),
  confirmation_message: z
    .string()
    .describe("A light UI confirmation message like 'Noted — fewer forts, more markets'"),
});

export type ProfileLearningDelta = z.infer<typeof ProfileLearningDeltaSchema>;

export class ProfileLearningAgent {
  constructor(private router: ModelRouter) {}

  /**
   * P6.3: Extract profile deltas from edit intent
   */
  public async learnFromEdit(editInput: string): Promise<ProfileLearningDelta> {
    const promptString = parseProfileLearningPrompt.userTemplate({ input: editInput });
    const { data } = await this.router.generateStructured(
      "extraction",
      promptString,
      ProfileLearningDeltaSchema,
      parseProfileLearningPrompt.system,
    );
    return data;
  }
}
