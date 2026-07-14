import { pingDb } from "@raah/db";
import { publicProcedure, router } from "./trpc.js";

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
});

export type AppRouter = typeof appRouter;
