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
      return google("gemini-flash-latest"); // Flash is fast enough for extraction
    }
    if (taskClass === "curation") {
      // ADR-013 free-tier-first. Verified live 2026-07-15: gemini-2.5-pro has
      // ZERO free quota and 2.5-flash 404s for new accounts — the -latest
      // aliases are what new free keys can actually call.
      return google("gemini-flash-latest");
    }
    if (taskClass === "critique") {
      if (flags.model.criticPaid && !flags.model.evalUsesFreeCritic) {
        // Paid critic path (ADR-014: different family, e.g. OpenAI) — until a
        // paid key exists this stays on flash; pro has no free quota.
        return google("gemini-flash-latest");
      }
      return google("gemini-flash-latest");
    }
    // Fallback
    return google("gemini-flash-latest");
  }

  public async generateStructured<T>(
    taskClass: TaskClass,
    prompt: string,
    schema: z.ZodSchema<T>,
    system?: string,
  ): Promise<{ data: T; usage: { prompt: number; completion: number } }> {
    const model = this.getModel(taskClass);

    // maxRetries 5 with the SDK's exponential backoff (~2+4+8+16+32s) rides
    // out a full free-tier RPM window instead of failing the whole plan job.
    const result = await generateObject({
      model,
      schema,
      system,
      prompt,
      maxRetries: 5,
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
