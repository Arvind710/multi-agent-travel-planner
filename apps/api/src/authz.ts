import { TRPCError } from "@trpc/server";
import { getTripRole, roleAtLeast, type TripRole } from "@raah/db";
import type { Context } from "./context";

/**
 * Trip-level authorization (ARCH §11): call at the top of any trip-scoped
 * procedure. Share-token capability checks are added with share routes (P6.8).
 */
export async function assertTripRole(
  ctx: Context,
  tripId: string,
  min: TripRole,
): Promise<TripRole> {
  if (!ctx.session.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const role = await getTripRole(ctx.db, tripId, ctx.session.userId);
  if (!role) {
    // NOT_FOUND, not FORBIDDEN: don't confirm the trip exists to non-members.
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  if (!roleAtLeast(role, min)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return role;
}
