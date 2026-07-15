import { z } from "zod";
import { publicProcedure, authedProcedure, router } from "../trpc";
import { TRPCError } from "@trpc/server";
import {
  createShareLink,
  getShareLink,
  listTripComments,
  addTripComment,
  loadPlanGraph,
} from "@raah/db";
import { randomBytes } from "node:crypto";

export const shareRouter = router({
  createLink: authedProcedure
    .input(z.object({ tripId: z.string().uuid(), permissions: z.enum(["view", "comment"]) }))
    .mutation(async ({ ctx, input }) => {
      // In reality, ensure ctx.userId has ownership of tripId
      const token = randomBytes(16).toString("hex");
      await createShareLink(ctx.db, {
        token,
        tripId: input.tripId,
        permissions: input.permissions,
      });
      return { token };
    }),

  getSharedTrip: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const link = await getShareLink(ctx.db, input.token);
      if (!link) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or expired share link." });
      }
      if (link.expiresAt && link.expiresAt < new Date()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Share link expired." });
      }

      const loaded = await loadPlanGraph(ctx.db, link.tripId);
      if (!loaded) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        graph: loaded.graph,
        permissions: link.permissions,
        comments: await listTripComments(ctx.db, link.tripId),
      };
    }),

  postComment: publicProcedure
    .input(
      z.object({
        token: z.string(),
        nodeRef: z.string(),
        content: z.string().min(1),
        authorName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const link = await getShareLink(ctx.db, input.token);
      if (!link || (link.expiresAt && link.expiresAt < new Date())) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Invalid link." });
      }
      if (link.permissions !== "comment") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Link does not allow commenting." });
      }

      return addTripComment(ctx.db, {
        tripId: link.tripId,
        nodeRef: input.nodeRef,
        content: input.content,
        authorName: input.authorName,
        authorId: ctx.session.userId ?? null,
      });
    }),
});
