import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { ProfilerAgent, ModelRouter } from "@raah/agents";
import { TravellerProfile, applyProfileDelta } from "@raah/shared/profile";

const modelRouter = new ModelRouter();
const profiler = new ProfilerAgent(modelRouter);

export const intakeRouter = router({
  parsePrompt: publicProcedure
    .input(z.object({ prompt: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const profile = await profiler.parseNL(input.prompt);
      return { profile };
    }),

  getNextClarifiers: publicProcedure
    .input(z.object({ profile: TravellerProfile }))
    .mutation(async ({ input }) => {
      const spec = await profiler.generateClarifiers(input.profile);
      return { clarifiers: spec.clarifiers };
    }),

  answerClarifier: publicProcedure
    .input(
      z.object({
        profile: TravellerProfile,
        deltas: z.array(
          z.object({
            path: z.string(),
            value: z.unknown(),
            provenance: z.enum([
              "clarifying_q1",
              "clarifying_q2",
              "clarifying_q3",
              "clarifying_q4",
              "clarifying_q5",
              "clarifying_q6",
              "clarifying_q7",
              "clarifying_q8",
            ]),
          }),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      const newProfile = applyProfileDelta(input.profile, input.deltas as any);
      return { profile: newProfile };
    }),
});
