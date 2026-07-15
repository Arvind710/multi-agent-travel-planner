/** India Knowledge Base: validated, human-reviewed content and deterministic retrieval. */
import type {
  ConstraintKb,
  FestivalHit,
  MonumentInfo,
  ParkInfo,
  PermitRequirement,
  SeasonStatus,
} from "@raah/constraints";
import { validateContent } from "./content";
import type { KbEntity, KbEntityKind } from "./schemas";

export * from "./schemas";
export * from "./content";
export * from "./ingest";

export interface RetrievalResult<T extends KbEntity = KbEntity> {
  entity: T;
  stale: boolean;
  sources: string[];
}
export interface SearchFilters {
  kind?: KbEntityKind;
  region?: string;
  limit?: number;
}

export interface KbCoverage {
  total: number;
  fresh: number;
  stale: number;
  byKind: Record<string, { total: number; fresh: number }>;
  byRegion: Record<string, { total: number; fresh: number }>;
}

export class KnowledgeBase implements ConstraintKb {
  private readonly byKindSlug = new Map<string, KbEntity>();
  constructor(
    readonly entities: readonly KbEntity[],
    private readonly now = new Date(),
  ) {
    for (const entity of entities) this.byKindSlug.set(`${entity.kind}:${entity.slug}`, entity);
  }

  static async fromContent(contentRoot: string, now?: Date): Promise<KnowledgeBase> {
    const result = await validateContent(contentRoot);
    if (result.issues.length)
      throw new Error(
        `Invalid KB content:\n${result.issues.map((i) => `${i.file}: ${i.message}`).join("\n")}`,
      );
    return new KnowledgeBase(result.entities, now);
  }

  lookup<K extends KbEntityKind>(
    kind: K,
    slug: string,
  ): RetrievalResult<Extract<KbEntity, { kind: K }>> | null {
    const entity = this.byKindSlug.get(`${kind}:${slug}`) as
      Extract<KbEntity, { kind: K }> | undefined;
    return entity
      ? {
          entity,
          stale: entity.meta.expires_at < this.now.toISOString().slice(0, 10),
          sources: entity.meta.sources,
        }
      : null;
  }

  /** Small, dependency-free hybrid fallback: deterministic filters + token relevance. pgvector is added by kb.ingest in production. */
  search(query: string, filters: SearchFilters = {}): RetrievalResult[] {
    const terms = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    return this.entities
      .filter((entity) => !filters.kind || entity.kind === filters.kind)
      .filter(
        (entity) =>
          !filters.region ||
          ("region" in entity && entity.region === filters.region) ||
          ("regions" in entity && entity.regions.includes(filters.region)),
      )
      .map((entity) => ({
        entity,
        score: terms.reduce(
          (score, term) => score + JSON.stringify(entity).toLowerCase().split(term).length - 1,
          0,
        ),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.entity.slug.localeCompare(b.entity.slug))
      .slice(0, filters.limit ?? 10)
      .map(({ entity }) => ({
        entity,
        stale: entity.meta.expires_at < this.now.toISOString().slice(0, 10),
        sources: entity.meta.sources,
      }));
  }

  seasonStatus(region: string, month: number): SeasonStatus {
    const climate = this.lookup("climate-calendar", region)?.entity;
    if (climate?.months?.[month]) return climate.months[month];
    return (
      this.lookup("climate-calendar", "india")?.entity.coverage?.[region]?.[month] ?? "unknown"
    );
  }
  permitsFor(region: string, nationality: string | undefined): PermitRequirement[] {
    const foreign = nationality !== undefined && nationality !== "IN";
    return this.entities
      .filter((e): e is Extract<KbEntity, { kind: "permit" }> => e.kind === "permit")
      .filter((e) => e.regions.includes(region) && (e.applies_to === "all" || foreign))
      .map((e) => ({
        permit_id: e.slug,
        name: e.name,
        lead_time_days: e.lead_time_days,
        channel: e.channel,
      }));
  }
  monument(slug: string): MonumentInfo | null {
    const e = this.lookup("monument", slug)?.entity;
    return e ? { closed_weekdays: e.closed_weekdays, closed_dates: e.closed_dates } : null;
  }
  park(slug: string): ParkInfo | null {
    const e = this.lookup("park", slug)?.entity;
    return e ? { closed_months: e.closed_months } : null;
  }
  festivalsOn(date: string, region?: string): FestivalHit[] {
    return this.entities
      .filter((e): e is Extract<KbEntity, { kind: "festival" }> => e.kind === "festival")
      .filter((e) => {
        const period = e.dates_by_year[date.slice(0, 4)];
        return !!period && date >= period.start && date <= period.end;
      })
      .filter((e) => e.regions.length === 0 || (!!region && e.regions.includes(region)))
      .map((e) => ({
        slug: e.slug,
        name: e.name,
        surge_factor: e.surge_factor,
        regions: e.regions,
      }));
  }
  sleepingAltitudeM(place: string): number | null {
    const normalized = place.toLowerCase().replace(/\s+/g, "-");
    return (
      this.entities
        .filter((e): e is Extract<KbEntity, { kind: "altitude" }> => e.kind === "altitude")
        .find((e) => e.slug === normalized || e.place.toLowerCase() === place.toLowerCase())
        ?.sleeping_altitude_m ?? null
    );
  }

  coverage(): KbCoverage {
    const today = this.now.toISOString().slice(0, 10);
    const result: KbCoverage = {
      total: this.entities.length,
      fresh: 0,
      stale: 0,
      byKind: {},
      byRegion: {},
    };
    for (const entity of this.entities) {
      const fresh = entity.meta.expires_at >= today;
      if (fresh) result.fresh++;
      else result.stale++;
      const kind = (result.byKind[entity.kind] ??= { total: 0, fresh: 0 });
      kind.total++;
      if (fresh) kind.fresh++;
      const regions =
        "region" in entity && typeof entity.region === "string"
          ? [entity.region]
          : "regions" in entity
            ? entity.regions
            : [];
      for (const regionName of regions) {
        const region = (result.byRegion[regionName] ??= { total: 0, fresh: 0 });
        region.total++;
        if (fresh) region.fresh++;
      }
    }
    return result;
  }
}
