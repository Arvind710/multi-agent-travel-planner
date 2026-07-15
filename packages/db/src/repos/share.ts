import { asc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { comments, shareLinks } from "../schema";

export type ShareLink = typeof shareLinks.$inferSelect;
export type TripComment = typeof comments.$inferSelect;

export async function createShareLink(
  db: Db,
  input: { token: string; tripId: string; permissions: "view" | "comment" },
): Promise<void> {
  await db.insert(shareLinks).values(input);
}

export async function getShareLink(db: Db, token: string): Promise<ShareLink | null> {
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  return link ?? null;
}

export async function listTripComments(db: Db, tripId: string): Promise<TripComment[]> {
  return db
    .select()
    .from(comments)
    .where(eq(comments.tripId, tripId))
    .orderBy(asc(comments.createdAt));
}

export async function addTripComment(
  db: Db,
  input: {
    tripId: string;
    nodeRef: string;
    content: string;
    authorName: string;
    authorId: string | null;
  },
): Promise<TripComment> {
  const [comment] = await db.insert(comments).values(input).returning();
  if (!comment) throw new Error("comment insert returned no row");
  return comment;
}
