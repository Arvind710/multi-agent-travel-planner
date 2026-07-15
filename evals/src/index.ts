/**
 * @raah/evals — golden briefs + plan-quality eval harness (ARCH §14.4).
 * Runner lands in P3.12; LLM-judge scoring in P5.8. Placeholder until then.
 */
import { fileURLToPath } from "node:url";
import { buildPipeline, ModelRouter } from "@raah/agents";
import { KnowledgeBase } from "@raah/kb";
import { emptyProfile } from "@raah/shared/profile";
import { z } from "zod";

export const EVALS_PACKAGE = "@raah/evals" as const;

const CONTENT_ROOT = fileURLToPath(new URL("../../content/kb", import.meta.url));

export async function runEval() {
  console.log("Starting Eval Harness v2 for Agent Runtime...");
  const kb = await KnowledgeBase.fromContent(CONTENT_ROOT);
  const pipeline = buildPipeline({ kb });
  const router = new ModelRouter();

  const JudgeOutputSchema = z.object({
    overall_score: z.number().min(0).max(1),
    rubric_evaluation: z.string(),
  });

  console.log("Generating 60 test profiles for Evaluation...");
  const profiles = Array.from({ length: 60 }).map((_, i) => {
    const p = emptyProfile();
    p.trip.origin.city = i % 2 === 0 ? "London" : "New York";
    p.party.adults = (i % 4) + 1;
    return p;
  });

  let successCount = 0;
  for (let i = 0; i < profiles.length; i++) {
    console.log(`\n--- Running Eval ${i + 1}/60 ---`);
    const profile = profiles[i];

    const initialState = {
      profile,
      graph: undefined,
      dirty: "all",
      criticReports: [],
      iteration: 0,
      budgetSpend: { spent: 0, budget: 100, tokens: { prompt: 0, completion: 0 } },
    };

    try {
      const config = { configurable: { thread_id: `eval-run-${i}` } };
      const finalState = await pipeline.invoke(initialState as any, config);

      const graph = (finalState as any).graph;
      if (graph && graph.concept && graph.route && graph.days) {
        // LLM Judge Evaluation
        const condensedForJudge = {
          concept: graph.concept.title,
          narrative: graph.concept.narrative,
          days: graph.days.length,
          stops: graph.route.length,
        };
        const prompt = `Evaluate this travel plan for the given profile.\nProfile: ${JSON.stringify(profile)}\nPlan: ${JSON.stringify(condensedForJudge)}\nScore from 0 (terrible) to 1 (perfect) based on personalization and constraints.`;

        try {
          const { data } = await router.generateStructured(
            "critique",
            prompt,
            JudgeOutputSchema,
            "You are an expert LLM judge.",
          );
          if (data.overall_score >= 0.7) {
            successCount++;
            console.log(
              `[PASS] Eval ${i + 1}: Generated Concept "${graph.concept.title}" | Score: ${data.overall_score.toFixed(2)}`,
            );
          } else {
            console.log(
              `[FAIL] Eval ${i + 1}: Score too low (${data.overall_score.toFixed(2)}) - ${data.rubric_evaluation}`,
            );
          }
        } catch {
          console.log(`[FAIL] Eval ${i + 1}: Judge failed to evaluate.`);
        }
      } else {
        console.log(`[FAIL] Eval ${i + 1}: Incomplete graph generated.`);
      }
    } catch (err: any) {
      console.error(`[ERROR] Eval ${i + 1}:`, err.message);
    }
  }

  console.log(`\n=== Eval Summary ===`);
  console.log(`Passed: ${successCount} / 60`);
  if (successCount === 60) {
    console.log("All eval briefs processed successfully!");
  }
}

if (process.argv[1] && process.argv[1].endsWith("index.ts")) {
  runEval().catch(console.error);
}
