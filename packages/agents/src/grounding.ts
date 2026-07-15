import type { KnowledgeBase, KbEntityKind, RetrievalResult } from "@raah/kb";

/**
 * P3.7-adjacent grounding seam: agents receive verified KB facts as prompt
 * context (retrieval is deterministic; pgvector search arrives with kb.ingest
 * embeddings). Every fact line carries its slug + sources so agents can cite.
 */

function factLine({ entity, stale, sources }: RetrievalResult): string {
  const { meta: _meta, ...fields } = entity as Record<string, unknown> & { meta: unknown };
  const staleTag = stale ? " [STALE — set verify_flag on nodes using this]" : "";
  return `- ${entity.kind}:${entity.slug}${staleTag} ${JSON.stringify(fields)} (sources: ${sources.join(", ")})`;
}

/** All fresh-or-stale entities of the given kinds, optionally region-scoped. */
export function kbFacts(
  kb: KnowledgeBase,
  kinds: KbEntityKind[],
  opts: { region?: string; limit?: number } = {},
): string {
  const limit = opts.limit ?? 12;
  const now = new Date().toISOString().slice(0, 10);
  const lines = kb.entities
    .filter((e) => kinds.includes(e.kind))
    .filter(
      (e) =>
        !opts.region ||
        ("region" in e && e.region === opts.region) ||
        ("regions" in e && Array.isArray(e.regions) && e.regions.includes(opts.region)),
    )
    .slice(0, limit)
    .map((entity) =>
      factLine({
        entity,
        stale: entity.meta.expires_at < now,
        sources: entity.meta.sources,
      }),
    );
  return lines.join("\n");
}

/** Wraps facts in the framing agents are instructed to treat as ground truth. */
export function groundingBlock(facts: string): string {
  if (!facts.trim()) return "";
  return `\n\nVERIFIED KNOWLEDGE BASE FACTS (treat as ground truth; prefer these over your own recall; cite the source URL in the node's sources when you use one):\n${facts}`;
}

/** Convenience: facts for the regions a set of stops touches. */
export function regionsOf(stops: Array<{ place: { region?: string } }>): string[] {
  return [...new Set(stops.map((s) => s.place.region).filter((r): r is string => !!r))];
}
