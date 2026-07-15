import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { travellerProfiles, tripMembers, trips } from "../schema";

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

/** Create a trip for a signed-in or anonymous session; returns the trip id. */
export async function createTrip(
  db: Db,
  input: { ownerId?: string; anonymousSessionId?: string; title?: string },
): Promise<string> {
  const [trip] = await db
    .insert(trips)
    .values({
      ownerId: input.ownerId ?? null,
      anonymousSessionId: input.anonymousSessionId ?? null,
      title: input.title ?? null,
      status: "generating",
    })
    .returning({ id: trips.id });
  if (!trip) throw new Error("trip insert returned no row");
  return trip.id;
}

export async function setTripStatus(
  db: Db,
  tripId: string,
  status: "draft" | "generating" | "active" | "archived",
): Promise<void> {
  await db.update(trips).set({ status }).where(eq(trips.id, tripId));
}

/** All trips owned by a user, newest first. */
export async function listTripsByOwner(db: Db, ownerId: string) {
  return db.select().from(trips).where(eq(trips.ownerId, ownerId)).orderBy(desc(trips.createdAt));
}

/** A user's saved traveller personas. */
export async function listTravellerProfiles(db: Db, userId: string) {
  return db.select().from(travellerProfiles).where(eq(travellerProfiles.userId, userId));
}
