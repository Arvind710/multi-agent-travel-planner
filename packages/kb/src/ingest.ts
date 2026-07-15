import { createHash } from "node:crypto";
import type { KbEntity } from "./schemas";

export interface KbEntityRecord {
  kind: string;
  slug: string;
  data: KbEntity;
  lastVerified: string;
  expiresAt: string;
  embedding?: number[];
  kbVersion: number;
}
export interface KbEntityStore {
  upsert(record: KbEntityRecord): Promise<"created" | "updated" | "unchanged">;
  bumpVersion(): Promise<number>;
}
export interface IngestReport {
  created: string[];
  updated: string[];
  unchanged: string[];
  kbVersion: number;
}

/**
 * Idempotent ingestion core. The worker supplies a Drizzle-backed store in production;
 * keeping this port tiny makes it deterministic and directly testable.
 */
export async function ingest(
  entities: readonly KbEntity[],
  store: KbEntityStore,
): Promise<IngestReport> {
  const report: Omit<IngestReport, "kbVersion"> = { created: [], updated: [], unchanged: [] };
  for (const entity of entities) {
    const outcome = await store.upsert({
      kind: entity.kind,
      slug: entity.slug,
      data: entity,
      lastVerified: entity.meta.last_verified,
      expiresAt: entity.meta.expires_at,
      embedding: deterministicEmbedding(entity),
      kbVersion: 0,
    });
    report[outcome].push(`${entity.kind}:${entity.slug}`);
  }
  return { ...report, kbVersion: await store.bumpVersion() };
}

/** Stable development embedding placeholder; worker adapters replace this with pgvector model output. */
export function deterministicEmbedding(entity: KbEntity): number[] {
  const digest = createHash("sha256").update(JSON.stringify(entity)).digest();
  return Array.from(
    { length: 768 },
    (_, index) => ((digest[index % digest.length] ?? 0) - 127.5) / 127.5,
  );
}
