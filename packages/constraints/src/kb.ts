/**
 * The KB interface the constraint rules read (P1.7). Deterministic reads only —
 * closures, permits, seasons are exact lookups, never vector search (ARCH §9.2).
 *
 * Until Phase 2 lands the real India KB, `StaticConstraintKb` serves tests and
 * fixtures; P2.9 swaps in an adapter over `packages/kb` with the same interface.
 */

export type SeasonStatus = "good" | "shoulder" | "avoid" | "closed" | "unknown";

export interface PermitRequirement {
  permit_id: string;
  name: string;
  lead_time_days: number;
  /** Application channel, e.g. "online — ilp.arunachal.gov.in". */
  channel: string;
}

export interface MonumentInfo {
  /** ISO weekdays (1=Mon … 7=Sun) the monument is closed. Taj Mahal: [5]. */
  closed_weekdays: number[];
  closed_dates?: string[];
}

export interface ParkInfo {
  /** Months (1–12) the park is closed. Most wildlife parks: Jul–Sep. */
  closed_months: number[];
}

export interface FestivalHit {
  slug: string;
  name: string;
  /** Price/crowd surge multiplier, 1.0 = none. */
  surge_factor: number;
  /** Region slugs affected; empty = national. */
  regions: string[];
}

export interface ConstraintKb {
  seasonStatus(region: string, month: number): SeasonStatus;
  /** Permits required for a region given a traveller nationality (ISO country). */
  permitsFor(region: string, nationality: string | undefined): PermitRequirement[];
  monument(slug: string): MonumentInfo | null;
  park(slug: string): ParkInfo | null;
  festivalsOn(dateISO: string, region?: string): FestivalHit[];
  /** Sleeping altitude in metres for a place slug/name, if known. */
  sleepingAltitudeM(place: string): number | null;
}

// ── static implementation ────────────────────────────────────────────────────

export interface StaticKbData {
  seasons: Record<string, Partial<Record<number, SeasonStatus>>>;
  permits: Record<string, { applies_to: "all" | "foreign"; requirement: PermitRequirement }[]>;
  monuments: Record<string, MonumentInfo>;
  parks: Record<string, ParkInfo>;
  festivals: {
    slug: string;
    name: string;
    start: string;
    end: string;
    surge_factor: number;
    regions: string[];
  }[];
  altitudes: Record<string, number>;
}

export class StaticConstraintKb implements ConstraintKb {
  constructor(private readonly data: StaticKbData) {}

  seasonStatus(region: string, month: number): SeasonStatus {
    return this.data.seasons[region.toLowerCase()]?.[month] ?? "unknown";
  }

  permitsFor(region: string, nationality: string | undefined): PermitRequirement[] {
    const entries = this.data.permits[region.toLowerCase()] ?? [];
    const isForeign = nationality !== undefined && nationality !== "IN";
    return entries.filter((e) => e.applies_to === "all" || isForeign).map((e) => e.requirement);
  }

  monument(slug: string): MonumentInfo | null {
    return this.data.monuments[slug.toLowerCase()] ?? null;
  }

  park(slug: string): ParkInfo | null {
    return this.data.parks[slug.toLowerCase()] ?? null;
  }

  festivalsOn(dateISO: string, region?: string): FestivalHit[] {
    return this.data.festivals
      .filter((f) => dateISO >= f.start && dateISO <= f.end)
      .filter((f) => f.regions.length === 0 || (region !== undefined && f.regions.includes(region)))
      .map(({ slug, name, surge_factor, regions }) => ({ slug, name, surge_factor, regions }));
  }

  sleepingAltitudeM(place: string): number | null {
    return this.data.altitudes[place.toLowerCase()] ?? null;
  }
}

/**
 * Fixture KB for tests (real values will live in `/content/kb` from P2 —
 * treat these numbers as test data, not truth).
 */
export const TEST_KB_DATA: StaticKbData = {
  seasons: {
    ladakh: {
      1: "closed",
      2: "closed",
      3: "closed",
      4: "shoulder",
      5: "good",
      6: "good",
      7: "good",
      8: "good",
      9: "good",
      10: "shoulder",
      11: "closed",
      12: "closed",
    },
    rajasthan: {
      1: "good",
      2: "good",
      3: "good",
      4: "shoulder",
      5: "avoid",
      6: "avoid",
      7: "shoulder",
      8: "shoulder",
      9: "shoulder",
      10: "good",
      11: "good",
      12: "good",
    },
    kerala: {
      1: "good",
      2: "good",
      3: "good",
      4: "shoulder",
      5: "shoulder",
      6: "avoid",
      7: "avoid",
      8: "shoulder",
      9: "good",
      10: "good",
      11: "good",
      12: "good",
    },
    himachal: {
      1: "shoulder",
      2: "shoulder",
      3: "good",
      4: "good",
      5: "good",
      6: "good",
      7: "avoid",
      8: "avoid",
      9: "good",
      10: "good",
      11: "good",
      12: "shoulder",
    },
  },
  permits: {
    arunachal: [
      {
        applies_to: "all",
        requirement: {
          permit_id: "arunachal-ilp",
          name: "Inner Line Permit (Arunachal Pradesh)",
          lead_time_days: 14,
          channel: "online — ilp.arunachal.gov.in",
        },
      },
    ],
    "sikkim-north": [
      {
        applies_to: "foreign",
        requirement: {
          permit_id: "sikkim-pap",
          name: "Protected Area Permit (North Sikkim)",
          lead_time_days: 21,
          channel: "registered tour operator",
        },
      },
    ],
  },
  monuments: {
    "taj-mahal": { closed_weekdays: [5] },
    "jaipur-city-palace": { closed_weekdays: [], closed_dates: ["2026-03-04"] },
  },
  parks: {
    ranthambore: { closed_months: [7, 8, 9] },
    periyar: { closed_months: [] },
  },
  festivals: [
    {
      slug: "diwali-2026",
      name: "Diwali",
      start: "2026-11-06",
      end: "2026-11-10",
      surge_factor: 1.8,
      regions: [],
    },
    {
      slug: "pushkar-mela-2026",
      name: "Pushkar Mela",
      start: "2026-11-18",
      end: "2026-11-25",
      surge_factor: 2.2,
      regions: ["rajasthan"],
    },
  ],
  altitudes: {
    leh: 3500,
    "nubra-valley": 3050,
    "pangong-tso": 4250,
    kaza: 3650,
    manali: 2050,
    jaipur: 430,
    delhi: 220,
    munnar: 1500,
  },
};

export function testKb(): ConstraintKb {
  return new StaticConstraintKb(TEST_KB_DATA);
}
