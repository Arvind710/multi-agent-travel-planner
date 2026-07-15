import { pingDb } from "@raah/db";
import { enqueuePlanGenerate } from "./jobs";
import { publicProcedure, router } from "./trpc";
import { intakeRouter } from "./routers/intake";
import { planRouter } from "./routers/plan";
import { shareRouter } from "./routers/share";

/**
 * Root tRPC router. Domain routers (trip, intake, plan, export, watch, profile)
 * land from P3.11 onward per ARCH §6.4.
 */
export const appRouter = router({
  ping: publicProcedure.query(() => ({ pong: true, ts: Date.now() })),
  dbCheck: publicProcedure.query(async ({ ctx }) => {
    await pingDb(ctx.db);
    return { db: "ok" as const };
  }),
  intake: intakeRouter,
  plan: planRouter,
  share: shareRouter,
  dev: router({
    /** P0 exit-gate helper: enqueue the heartbeat job and watch it stream on /api/jobs/:id/events. */
    enqueueHeartbeat: publicProcedure.mutation(async () => {
      const jobId = await enqueuePlanGenerate({ kind: "heartbeat-smoke" });
      return { jobId, events: `/api/jobs/${jobId}/events` };
    }),
  }),
});

export type AppRouter = typeof appRouter;
