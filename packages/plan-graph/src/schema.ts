import { z } from "zod";
import { Money } from "@raah/shared/money";
import { AnyNodeId, nodeIdOf } from "./ids";

/**
 * The canonical PlanGraph schema (ARCH §5.1) — the single source of truth the
 * whole product renders, exports, and mutates. Zod is the single validator:
 * the DB never stores a graph that fails this schema (ARCH §5.2).
 *
 * Field naming is snake_case: the graph is a serialized domain document
 * (JSONB, SSE patches, exports), not a TS-internal object.
 */

// ── primitives ───────────────────────────────────────────────────────────────

/** ISO calendar date, e.g. "2026-12-05" (IST-anchored everywhere). */
export const ISODateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)");

/** 24h wall-clock time, e.g. "06:30". */
export const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");
export type TimeOfDay = z.infer<typeof TimeOfDay>;

/**
 * Lock state (ARCH §5.1 LockState): "user" means the traveller pinned this
 * node ("keep this hotel no matter what") — the mutation engine rejects
 * writes to it by any non-user actor.
 */
export const LockState = z.enum(["none", "user"]);
export type LockState = z.infer<typeof LockState>;

/** Every reasoning line must be traceable to the profile (PS §15.1). */
export const Reasoning = z.object({
  summary: z.string().min(1),
  /** Profile field refs, e.g. "taste.anti:crowds", "taste.interests.food". */
  profile_refs: z.array(z.string()).default([]),
  tradeoffs_considered: z.array(z.string()).default([]),
});
export type Reasoning = z.infer<typeof Reasoning>;

/** Grounding: every factual claim carries sources or a verify flag (ARCH §0.4). */
export const SourceRef = z.object({
  kind: z.enum(["kb", "api", "manual"]),
  /** KB entity slug, provider request id, or a human note. */
  id: z.string().min(1),
  last_verified: ISODateSchema.optional(),
  url: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const LinkRef = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
  kind: z.enum(["booking", "info", "map", "official"]).default("info"),
});
export type LinkRef = z.infer<typeof LinkRef>;

export const PlaceRef = z.object({
  name: z.string().min(1),
  /** KB region slug, e.g. "rajasthan" — constraint rules key off this. */
  region: z.string().optional(),
  /** KB entity slug (monument/park/venue) when the place is a known entity. */
  kb_ref: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type PlaceRef = z.infer<typeof PlaceRef>;

// ── concept ──────────────────────────────────────────────────────────────────

export const DiscardedAlternative = z.object({
  title: z.string().min(1),
  /** Honest reason, e.g. "forces two 5-hour drives that violate your pace" (PS §6.1). */
  reason: z.string().min(1),
});
export type DiscardedAlternative = z.infer<typeof DiscardedAlternative>;

export const Concept = z.object({
  node_id: nodeIdOf("concept"),
  title: z.string().min(1),
  narrative: z.string().min(1),
  region_strategy: z.string().min(1),
  discarded_alternatives: z.array(DiscardedAlternative).default([]),
});
export type Concept = z.infer<typeof Concept>;

// ── route ────────────────────────────────────────────────────────────────────

export const Stop = z.object({
  node_id: nodeIdOf("stop"),
  place: PlaceRef,
  arrive: ISODateSchema,
  depart: ISODateSchema,
  nights: z.number().int().min(0),
  rationale: Reasoning,
  locks: LockState.default("none"),
});
export type Stop = z.infer<typeof Stop>;

// ── days & blocks ────────────────────────────────────────────────────────────

export const BlockKind = z.enum(["experience", "transit", "meal", "rest", "anchor"]);
export type BlockKind = z.infer<typeof BlockKind>;

export const TimeWindow = z.object({ start: TimeOfDay, end: TimeOfDay });
export type TimeWindow = z.infer<typeof TimeWindow>;

const blockFields = {
  node_id: nodeIdOf("block"),
  kind: BlockKind,
  time_window: TimeWindow,
  title: z.string().min(1),
  place_ref: PlaceRef.optional(),
  duration_minutes: z.number().int().min(0),
  cost: Money,
  reasoning: Reasoning,
  /** The correct gate, what to order, when crowds arrive… (PS §6.2 insider layer). */
  insider_notes: z.string().optional(),
  links: z.array(LinkRef).default([]),
  /**
   * Deterministic labels constraint rules match on — same vocabulary as
   * profile anti-preferences ("crowds", "guided_tours", "fort"…).
   */
  tags: z.array(z.string()).default([]),
  /**
   * True when the plan knowingly violates an anti-preference as an explicit,
   * user-visible trade-off (PS §15.5) — the anti-preference rule allows only these.
   */
  tradeoff_flagged: z.boolean().default(false),
  sources: z.array(SourceRef).default([]),
  verify_flag: z.boolean().default(false),
};

/** An alternative offered in the SwapSheet: full block content, no nesting. */
export const BlockAlternative = z.object(blockFields);
export type BlockAlternative = z.infer<typeof BlockAlternative>;

export const Block = z.object({
  ...blockFields,
  alternatives: z.array(BlockAlternative).max(2).default([]),
  locks: LockState.default("none"),
});
export type Block = z.infer<typeof Block>;

export const MealSlot = z.object({
  node_id: nodeIdOf("meal"),
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  venue: z.string().min(1),
  place_ref: PlaceRef.optional(),
  /** Dish-level guidance — "what to order" (PS §6.2). */
  dishes: z.array(z.string()).default([]),
  fallback_venue: z.string().optional(),
  /** Diet flags this venue satisfies, e.g. ["veg", "jain"]. */
  diet_flags: z.array(z.string()).default([]),
  cost: Money,
  reasoning: Reasoning.optional(),
  links: z.array(LinkRef).default([]),
  tags: z.array(z.string()).default([]),
  sources: z.array(SourceRef).default([]),
  verify_flag: z.boolean().default(false),
  locks: LockState.default("none"),
});
export type MealSlot = z.infer<typeof MealSlot>;

export const EnergyRating = z.enum(["light", "moderate", "full"]);
export type EnergyRating = z.infer<typeof EnergyRating>;

export const WeatherNormals = z.object({
  high_c: z.number(),
  low_c: z.number(),
  rain_mm: z.number().optional(),
});
export type WeatherNormals = z.infer<typeof WeatherNormals>;

export const Day = z.object({
  node_id: nodeIdOf("day"),
  date: ISODateSchema,
  stop_ref: nodeIdOf("stop"),
  theme: z.string().optional(),
  energy_rating: EnergyRating,
  weather_normals: WeatherNormals.optional(),
  blocks: z.array(Block).default([]),
  meals: z.array(MealSlot).default([]),
  /** "Nothing planned after 4pm — day 6 is your highest-fatigue day" (PS §6.2). */
  buffer_notes: z.string().optional(),
  locks: LockState.default("none"),
});
export type Day = z.infer<typeof Day>;

// ── stays ────────────────────────────────────────────────────────────────────

export const Stay = z.object({
  name: z.string().min(1),
  /** Taste styles, not star ratings: "heritage", "boutique", "homestay"… */
  style_tags: z.array(z.string()).default([]),
  area: z.string().optional(),
  price_per_night: Money,
  links: z.array(LinkRef).default([]),
  cancellation_note: z.string().optional(),
  /** Location logic: "8 min walk to the old-city gate where days 3–4 happen". */
  distance_note: z.string().optional(),
  /** Mobility fit, e.g. "150-year-old haveli — stairs, no lift". */
  mobility_note: z.string().optional(),
  sources: z.array(SourceRef).default([]),
  verify_flag: z.boolean().default(false),
});
export type Stay = z.infer<typeof Stay>;

export const StayAssignment = z.object({
  node_id: nodeIdOf("stay"),
  stop_ref: nodeIdOf("stop"),
  primary: Stay,
  /** Two alternates: one cheaper, one splurge (PS §6.3). */
  alternates: z.array(Stay).max(2).default([]),
  reasoning: Reasoning,
  locks: LockState.default("none"),
});
export type StayAssignment = z.infer<typeof StayAssignment>;

// ── transit legs ─────────────────────────────────────────────────────────────

export const TransitMode = z.enum(["train", "flight", "car", "bus", "ferry"]);
export type TransitMode = z.infer<typeof TransitMode>;

export const BookingInfo = z.object({
  /** e.g. "irctc", "airline-direct", "ota". */
  channel: z.string().min(1),
  /** When the booking window opens (IRCTC: departure − 60 days). */
  opens_at: ISODateSchema.optional(),
  urgency: z.string().optional(),
  waitlist_risk: z.enum(["low", "medium", "high"]).optional(),
});
export type BookingInfo = z.infer<typeof BookingInfo>;

export const TransitLeg = z.object({
  node_id: nodeIdOf("leg"),
  from_stop_ref: nodeIdOf("stop"),
  to_stop_ref: nodeIdOf("stop"),
  mode: TransitMode,
  operator: z.string().optional(),
  /** Train number / flight number. */
  service_ref: z.string().optional(),
  class_options: z.array(z.string()).default([]),
  recommended_class: z.string().optional(),
  depart_date: ISODateSchema,
  depart_time: TimeOfDay.optional(),
  arrive_date: ISODateSchema.optional(),
  arrive_time: TimeOfDay.optional(),
  scheduled_duration_minutes: z.number().int().min(0).optional(),
  /** Honest duration — Himachal ≠ expressway speeds (PS §5.1). */
  realistic_duration_minutes: z.number().int().min(0),
  booking: BookingInfo.optional(),
  links: z.array(LinkRef).default([]),
  /** Points at the FragileLeg risk node holding this leg's plan B. */
  fallback_ref: nodeIdOf("risk").optional(),
  cost: Money,
  reasoning: Reasoning,
  tags: z.array(z.string()).default([]),
  sources: z.array(SourceRef).default([]),
  verify_flag: z.boolean().default(false),
  locks: LockState.default("none"),
});
export type TransitLeg = z.infer<typeof TransitLeg>;

// ── budget ───────────────────────────────────────────────────────────────────

export const BudgetCategory = z.enum(["stays", "food", "experiences", "transport", "fees", "misc"]);
export type BudgetCategory = z.infer<typeof BudgetCategory>;

export const LineItem = z.object({
  node_id: nodeIdOf("line_item"),
  /** The graph node this cost belongs to — must exist (invariant). */
  node_ref: AnyNodeId,
  category: BudgetCategory,
  label: z.string().min(1),
  amount: Money,
  confidence: z.enum(["estimate", "quoted", "booked"]),
  date: ISODateSchema.optional(),
});
export type LineItem = z.infer<typeof LineItem>;

export const BudgetTradeoff = z.object({
  /** "Drop to 3A on the overnight train: –₹9,400" (PS §6.5). */
  label: z.string().min(1),
  delta: Money,
});
export type BudgetTradeoff = z.infer<typeof BudgetTradeoff>;

export const Ledger = z.object({
  node_id: nodeIdOf("ledger"),
  line_items: z.array(LineItem).default([]),
  totals_by_category: z.partialRecord(BudgetCategory, Money).default({}),
  total: Money,
  vs_stated: z
    .object({
      stated: Money.optional(),
      delta_pct: z.number().optional(),
      /** Required when |delta_pct| > 10 — deviations must be justified (PS §15.8). */
      justification: z.string().optional(),
    })
    .default({}),
  tradeoffs: z.array(BudgetTradeoff).default([]),
});
export type Ledger = z.infer<typeof Ledger>;

// ── risk / pretrip / packing ────────────────────────────────────────────────

export const PlanB = z.object({
  summary: z.string().min(1),
  node_refs: z.array(AnyNodeId).default([]),
});
export type PlanB = z.infer<typeof PlanB>;

export const FragileLeg = z.object({
  node_id: nodeIdOf("risk"),
  /** Usually a leg, but a fragile block (e.g. fog-dependent sunrise) is valid too. */
  target_ref: AnyNodeId,
  probability: z.number().min(0).max(1),
  cause: z.string().min(1),
  plan_b: PlanB,
});
export type FragileLeg = z.infer<typeof FragileLeg>;

export const TimelineItem = z.object({
  node_id: nodeIdOf("pretrip"),
  due: ISODateSchema,
  /** Days before trip start, e.g. -60 for "T-60 book trains". */
  offset_days: z.number().int().optional(),
  label: z.string().min(1),
  kind: z.enum(["booking", "visa", "permit", "health", "download", "other"]).default("other"),
  /** Machine-checkable tags, e.g. "permit:arunachal-ilp" (permit rule keys off these). */
  tags: z.array(z.string()).default([]),
  refs: z.array(AnyNodeId).default([]),
  links: z.array(LinkRef).default([]),
});
export type TimelineItem = z.infer<typeof TimelineItem>;

export const PackingItem = z.object({
  label: z.string().min(1),
  reason: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type PackingItem = z.infer<typeof PackingItem>;

export const PackingList = z.object({
  node_id: nodeIdOf("packing"),
  items: z.array(PackingItem).default([]),
});
export type PackingList = z.infer<typeof PackingList>;

// ── the graph ────────────────────────────────────────────────────────────────

export const PlanGraphStatus = z.enum(["draft", "validated", "shipped"]);
export type PlanGraphStatus = z.infer<typeof PlanGraphStatus>;

export const PlanGraphMeta = z.object({
  trip_id: z.string().min(1),
  version: z.number().int().min(1),
  profile_version: z.number().int().min(1),
  status: PlanGraphStatus,
  critic_score: z.number().min(0).max(1).optional(),
  created_by_job: z.string().optional(),
});
export type PlanGraphMeta = z.infer<typeof PlanGraphMeta>;

export const PlanGraph = z.object({
  meta: PlanGraphMeta,
  concept: Concept,
  route: z.array(Stop).default([]),
  days: z.array(Day).default([]),
  stays: z.array(StayAssignment).default([]),
  legs: z.array(TransitLeg).default([]),
  budget: Ledger,
  risk: z.array(FragileLeg).default([]),
  pretrip: z.array(TimelineItem).default([]),
  packing: PackingList,
});
export type PlanGraph = z.infer<typeof PlanGraph>;

/** Parse + validate an untrusted graph (e.g. loaded JSONB). Throws ZodError. */
export function parsePlanGraph(data: unknown): PlanGraph {
  return PlanGraph.parse(data);
}

export function safeParsePlanGraph(data: unknown) {
  return PlanGraph.safeParse(data);
}
