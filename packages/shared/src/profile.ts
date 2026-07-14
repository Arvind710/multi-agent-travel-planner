import { z } from "zod";
import { CurrencyCode, Money } from "./money";

/**
 * The Traveller Profile — the canonical internal schema every agent reads
 * (PS §4.4). All inputs (parsed, asked, form-filled, inferred from edits)
 * normalise into this one versioned object.
 *
 * Provenance matters: every field records where it came from, so the system
 * can distinguish "user said" from "we assumed" and label assumptions honestly.
 */

const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)");

/** 0–1 confidence attached to extracted fields (PS §4.1 confidence tagging). */
const Confidence = z.number().min(0).max(1);

// ── provenance ───────────────────────────────────────────────────────────────

/**
 * Where a profile field came from: "nl_parse", "clarifying_q3", "form",
 * "inferred_from_edit", "default". Keyed by dot path, e.g. "taste.pace".
 */
export const ProvenanceSource = z
  .string()
  .regex(
    /^(nl_parse|clarifying_q\d+|form|inferred_from_edit|default)$/,
    "Unknown provenance source",
  );
export type ProvenanceSource = z.infer<typeof ProvenanceSource>;

export const ProvenanceMap = z.record(z.string(), ProvenanceSource);
export type ProvenanceMap = z.infer<typeof ProvenanceMap>;

// ── trip ─────────────────────────────────────────────────────────────────────

export const TripAnchor = z.object({
  place: z.string().min(1),
  dates: z.array(ISODate).min(1).max(2),
  event: z.string().min(1),
  /** Hard anchors (wedding dates) can never be moved by the planner. */
  hard: z.boolean().default(true),
});
export type TripAnchor = z.infer<typeof TripAnchor>;

export const TripFacts = z.object({
  dates: z
    .object({
      start: ISODate.optional(),
      end: ISODate.optional(),
      flexibility_days: z.number().int().min(0).max(14).default(0),
      confidence: Confidence.optional(),
    })
    .prefault({}),
  /** Nights count when dates are fuzzy ("2 weeks in December"). */
  duration_nights: z.number().int().positive().optional(),
  origin: z.object({ city: z.string().optional(), country: z.string().optional() }).prefault({}),
  entry_exit: z
    .object({
      entry: z.string().optional(),
      /** IATA code or "auto" = let the planner decide. */
      exit: z.string().optional(),
      confidence: Confidence.optional(),
    })
    .prefault({}),
  anchors: z.array(TripAnchor).default([]),
});
export type TripFacts = z.infer<typeof TripFacts>;

// ── party / budget ───────────────────────────────────────────────────────────

export const PartyComposition = z.object({
  adults: z.number().int().min(1).default(1),
  /** Ages of children/seniors — pacing and comfort rules read these. */
  children: z.array(z.number().int().min(0).max(17)).default([]),
  seniors: z.array(z.number().int().min(60)).default([]),
  solo_female: z.boolean().default(false),
});
export type PartyComposition = z.infer<typeof PartyComposition>;

export const BudgetTier = z.enum([
  "shoestring",
  "value",
  "upper-mid",
  "comfort",
  "luxury",
  "uncapped",
]);
export type BudgetTier = z.infer<typeof BudgetTier>;

export const BudgetFacts = z.object({
  total: z.number().positive().optional(),
  currency: CurrencyCode.default("INR"),
  per_person: z.boolean().default(false),
  includes_flights: z.boolean().default(false),
  tier: BudgetTier.optional(),
  split_bias: z
    .object({
      stays: z.number().min(0).max(1),
      food: z.number().min(0).max(1),
      experiences: z.number().min(0).max(1),
      transport: z.number().min(0).max(1),
    })
    .optional(),
});
export type BudgetFacts = z.infer<typeof BudgetFacts>;

/** The stated budget as Money, when one exists. */
export function statedBudget(budget: BudgetFacts): Money | null {
  if (budget.total == null) return null;
  return { amount: budget.total, currency: budget.currency };
}

// ── taste ────────────────────────────────────────────────────────────────────

export const TasteProfile = z.object({
  /** 0 = "2 places, deeply" … 1 = "see everything". Highest-impact variable. */
  pace: z.number().min(0).max(1).optional(),
  /** Weighted interests 0–5 ("food", "architecture", "wildlife"…). Weights, not checkboxes. */
  interests: z.record(z.string(), z.number().int().min(0).max(5)).prefault({}),
  /** Anti-preferences — highest-signal field. Same vocabulary as graph node tags. */
  anti: z.array(z.string()).default([]),
  /** 0 = offbeat-only … 1 = iconic-even-if-mobbed. */
  crowd_tolerance: z.number().min(0).max(1).optional(),
  stay_styles: z.array(z.string()).default([]),
  food: z
    .object({
      diet: z.enum(["none", "veg", "vegan", "jain", "halal", "kosher"]).default("none"),
      spice: z.number().min(0).max(1).optional(),
      street_food: z.boolean().optional(),
      food_as_destination: z.boolean().optional(),
    })
    .prefault({}),
  experience_level: z.enum(["first_time", "some", "extensive"]).optional(),
  references: z.object({ loved: z.string().optional(), hated: z.string().optional() }).prefault({}),
  vibe: z.array(z.string()).default([]),
});
export type TasteProfile = z.infer<typeof TasteProfile>;

// ── constraints ──────────────────────────────────────────────────────────────

export const TravelConstraints = z.object({
  /** Acceptable transport, e.g. ["flights", "ac_trains", "private_car"]. */
  transport_floor: z.array(z.string()).default([]),
  max_daily_travel_hours: z.number().positive().max(24).optional(),
  altitude_ok: z.enum(["yes", "no", "unknown"]).default("unknown"),
  health: z.array(z.string()).default([]),
  diet_flags: z.array(z.string()).default([]),
  /** Mobility needs: "wheelchair", "no_stairs", "limited_walking". */
  mobility: z.array(z.string()).default([]),
  safety_posture: z.enum(["standard", "heightened"]).default("standard"),
  visa: z
    .object({
      nationality: z.string().optional(),
      evisa_eligible: z.boolean().optional(),
      status: z.enum(["not_needed", "not_applied", "applied", "granted"]).optional(),
    })
    .prefault({}),
});
export type TravelConstraints = z.infer<typeof TravelConstraints>;

// ── output prefs / the profile ───────────────────────────────────────────────

export const OutputPrefs = z.object({
  detail: z.enum(["skeleton", "standard", "high"]).default("standard"),
  reasoning: z.enum(["key_decisions", "full"]).default("full"),
  language: z.string().default("en"),
  currency: CurrencyCode.default("INR"),
});
export type OutputPrefs = z.infer<typeof OutputPrefs>;

export const TravellerProfile = z.object({
  profile_version: z.number().int().min(1).default(1),
  trip: TripFacts.prefault({}),
  party: PartyComposition.prefault({}),
  budget: BudgetFacts.prefault({}),
  taste: TasteProfile.prefault({}),
  constraints: TravelConstraints.prefault({}),
  output_prefs: OutputPrefs.prefault({}),
  provenance: ProvenanceMap.prefault({}),
});
export type TravellerProfile = z.infer<typeof TravellerProfile>;

/** A fresh all-defaults profile (version 1, everything assumed). */
export function emptyProfile(): TravellerProfile {
  return TravellerProfile.parse({});
}

// ── deltas ───────────────────────────────────────────────────────────────────

/**
 * A single field change with its provenance — the unit every input surface
 * (NL parse, clarifier answer, form field, edit inference) emits.
 */
export const ProfileDelta = z.object({
  /** Dot path into the profile, e.g. "taste.anti" or "trip.dates.start". */
  path: z.string().min(1),
  value: z.unknown(),
  provenance: ProvenanceSource,
});
export type ProfileDelta = z.infer<typeof ProfileDelta>;

export class ProfileDeltaError extends Error {
  constructor(
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = "ProfileDeltaError";
  }
}

/**
 * Apply deltas immutably: sets each path, records provenance, bumps
 * profile_version, and re-validates the whole profile. Throws
 * ProfileDeltaError on paths/values that produce an invalid profile.
 */
export function applyProfileDelta(
  profile: TravellerProfile,
  deltas: ProfileDelta[],
): TravellerProfile {
  if (deltas.length === 0) return profile;
  const next = structuredClone(profile) as Record<string, unknown>;
  for (const delta of deltas) {
    if (delta.path === "profile_version" || delta.path.startsWith("provenance")) {
      throw new ProfileDeltaError(`Path "${delta.path}" is managed, not settable`);
    }
    setPath(next, delta.path, delta.value);
    (next.provenance as Record<string, string>)[delta.path] = delta.provenance;
  }
  next.profile_version = profile.profile_version + 1;
  const parsed = TravellerProfile.safeParse(next);
  if (!parsed.success) {
    throw new ProfileDeltaError("Deltas produce an invalid profile", parsed.error.issues);
  }
  return parsed.data;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  if (segments.some((s) => s.length === 0 || s === "__proto__" || s === "constructor")) {
    throw new ProfileDeltaError(`Invalid profile path "${path}"`);
  }
  let node = target;
  for (const segment of segments.slice(0, -1)) {
    const child = node[segment];
    if (child == null || typeof child !== "object" || Array.isArray(child)) {
      node[segment] = {};
    }
    node = node[segment] as Record<string, unknown>;
  }
  const leaf = segments.at(-1);
  if (!leaf) throw new ProfileDeltaError(`Invalid profile path "${path}"`);
  // undefined unsets: schema re-validation treats it as absent for optional fields
  node[leaf] = value;
}
