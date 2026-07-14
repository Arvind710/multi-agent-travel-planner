import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Requires a signed-in user (Auth.js session). Anonymous users get UNAUTHORIZED. */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, userId: ctx.session.userId } });
});
