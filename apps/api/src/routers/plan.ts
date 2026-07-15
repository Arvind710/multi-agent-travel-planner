import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { enqueuePlanGenerate } from "../jobs";
import { TravellerProfile } from "@raah/shared/profile";
import { createTrip } from "@raah/db";

export const planRouter = router({
  /** P3.11: create the trip row, enqueue generation, hand back the SSE channel. */
  generate: publicProcedure
    .input(z.object({ profile: TravellerProfile, title: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const tripId = await createTrip(ctx.db, {
        ownerId: ctx.session.userId ?? undefined,
        anonymousSessionId: ctx.session.anonymousId ?? undefined,
        title: input.title,
      });
      const jobId = await enqueuePlanGenerate({
        kind: "plan-generate",
        profile: input.profile,
        tripId,
      });
      return { jobId, tripId, events: `/api/jobs/${jobId}/events` };
    }),
});
