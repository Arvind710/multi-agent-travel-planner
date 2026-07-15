import { and, eq } from "drizzle-orm";
import { kbEntities } from "../schema";
import type { Db } from "../client";

export interface KbUpsertInput {
  kind: string;
  slug: string;
  data: unknown;
  lastVerified: string;
  expiresAt: string;
  embedding?: number[];
  kbVersion: number;
}

/** Idempotent persistence seam for the kb.ingest worker job. */
export async function upsertKbEntity(
  db: Db,
  input: KbUpsertInput,
): Promise<"created" | "updated" | "unchanged"> {
  const existing = await db.query.kbEntities.findFirst({
    where: and(eq(kbEntities.kind, input.kind), eq(kbEntities.slug, input.slug)),
  });
  const same =
    existing &&
    JSON.stringify(existing.data) === JSON.stringify(input.data) &&
    existing.lastVerified === input.lastVerified &&
    existing.expiresAt === input.expiresAt;
  if (same) return "unchanged";
  if (existing) {
    await db
      .update(kbEntities)
      .set({
        data: input.data,
        lastVerified: input.lastVerified,
        expiresAt: input.expiresAt,
        embedding: input.embedding,
        kbVersion: input.kbVersion,
        updatedAt: new Date(),
      })
      .where(and(eq(kbEntities.kind, input.kind), eq(kbEntities.slug, input.slug)));
    return "updated";
  }
  await db.insert(kbEntities).values({
    kind: input.kind,
    slug: input.slug,
    data: input.data,
    lastVerified: input.lastVerified,
    expiresAt: input.expiresAt,
    embedding: input.embedding,
    kbVersion: input.kbVersion,
  });
  return "created";
}
