import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject, generateText, LanguageModel } from "ai";
import { z } from "zod";
import { loadFlags } from "@raah/shared/flags";
import { loadEnv } from "@raah/shared/env";

export type TaskClass = "extraction" | "curation" | "critique" | "embedding";

// The repo's env contract is GEMINI_API_KEY; the SDK's default env var is
// GOOGLE_GENERATIVE_AI_API_KEY, so wire it explicitly.
const google = createGoogleGenerativeAI({
  apiKey: loadEnv().GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

/** True when a Gemini key is configured — pipeline callers gate on this. */
export function llmConfigured(): boolean {
  return Boolean(loadEnv().GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export class ModelRouter {
  public getModel(taskClass: TaskClass): LanguageModel {
    const flags = loadFlags();
    if (taskClass === "extraction") {
      return google("gemini-2.5-flash"); // Flash is fast enough for extraction
    }
    if (taskClass === "curation") {
      return google("gemini-2.5-pro"); // Using pro for curation to ensure high quality
    }
    if (taskClass === "critique") {
      if (flags.model.criticPaid && !flags.model.evalUsesFreeCritic) {
        // Ideally openai("gpt-4o-mini") but we will use gemini as placeholder
        return google("gemini-2.5-pro");
      }
      return google("gemini-2.5-flash");
    }
    // Fallback
    return google("gemini-2.5-flash");
  }

  public async generateStructured<T>(
    taskClass: TaskClass,
    prompt: string,
    schema: z.ZodSchema<T>,
    system?: string,
  ): Promise<{ data: T; usage: { prompt: number; completion: number } }> {
    const model = this.getModel(taskClass);

    // Auto-retry once on validation failure is handled naturally by generateObject retries,
    // but ai sdk maxRetries can be set.
    const result = await generateObject({
      model,
      schema,
      system,
      prompt,
      maxRetries: 2,
    });

    return {
      data: result.object,
      usage: {
        prompt: (result.usage as any).promptTokens || 0,
        completion: (result.usage as any).completionTokens || 0,
      },
    };
  }

  public async generateText(
    taskClass: TaskClass,
    prompt: string,
    system?: string,
  ): Promise<{ text: string; usage: { prompt: number; completion: number } }> {
    const model = this.getModel(taskClass);
    const result = await generateText({
      model,
      system,
      prompt,
      maxRetries: 2,
    });

    return {
      text: result.text,
      usage: {
        prompt: (result.usage as any).promptTokens || 0,
        completion: (result.usage as any).completionTokens || 0,
      },
    };
  }
}
