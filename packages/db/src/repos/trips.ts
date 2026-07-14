import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { tripMembers, trips } from "../schema";

export type TripRole = "owner" | "editor" | "commenter" | "viewer";

const ROLE_RANK: Record<TripRole, number> = { owner: 3, editor: 2, commenter: 1, viewer: 0 };

export function roleAtLeast(actual: TripRole, min: TripRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[min];
}

/** A user's effective role on a trip: ownership wins, then explicit membership. */
export async function getTripRole(
  db: Db,
  tripId: string,
  userId: string,
): Promise<TripRole | null> {
  const [trip] = await db
    .select({ ownerId: trips.ownerId })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip) return null;
  if (trip.ownerId === userId) return "owner";

  const [membership] = await db
    .select({ role: tripMembers.role })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
    .limit(1);
  return membership?.role ?? null;
}
