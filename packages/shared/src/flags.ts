import { z } from "zod";

/**
 * Typed config-file feature flags (P0.15, ARCH ADR-011 era): the typed object IS
 * the seam — no flag service at bootstrap. Env-overridable per flag:
 *   FLAG_PROVIDER_MAPS_LIVE=true  →  flags.provider.mapsLive
 * (SCREAMING_SNAKE after FLAG_, segments map to camelCase path.)
 */
const FlagsSchema = z.object({
  provider: z.object({
    /** live adapters land per-provider in P7, each behind its flag */
    mapsLive: z.boolean().default(false),
    weatherLive: z.boolean().default(false),
    aqiLive: z.boolean().default(false),
    fxLive: z.boolean().default(false),
    hotelsDeepLink: z.boolean().default(false),
    railDeepLink: z.boolean().default(false),
    flightsDeepLink: z.boolean().default(false),
  }),
  model: z.object({
    /** ADR-014: Critic on paid OpenAI credit; off → free-tier critic routing */
    criticPaid: z.boolean().default(true),
    /** eval runs use free-tier critique to protect the $5 credit (ARCH §7.6) */
    evalUsesFreeCritic: z.boolean().default(true),
  }),
  features: z.object({
    priceWatch: z.boolean().default(false), // P7.7: UI stub only, disabled
    hindiOutput: z.boolean().default(false), // P8.3
    lowBandwidthMode: z.boolean().default(false), // P8.2
  }),
});

export type Flags = z.infer<typeof FlagsSchema>;

type FlagLeaves = { [G in keyof Flags]: { group: G; key: keyof Flags[G] } }[keyof Flags];

function envKeyFor(group: string, key: string): string {
  return `FLAG_${group.toUpperCase()}_${key.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
}

let cached: Flags | undefined;

/** Defaults from the schema, overridden by FLAG_* env vars, Zod-validated. */
export function loadFlags(): Flags {
  if (cached) return cached;
  const flags = FlagsSchema.parse({ provider: {}, model: {}, features: {} });
  for (const group of Object.keys(flags) as (keyof Flags)[]) {
    for (const key of Object.keys(flags[group])) {
      const raw = process.env[envKeyFor(group, key)];
      if (raw !== undefined) {
        (flags[group] as Record<string, boolean>)[key] = raw === "true" || raw === "1";
      }
    }
  }
  cached = FlagsSchema.parse(flags);
  return cached;
}

/** Test helper. */
export function resetFlagsCache(): void {
  cached = undefined;
}

export type { FlagLeaves };
