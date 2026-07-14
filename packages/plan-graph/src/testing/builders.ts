import { monotonicFactory } from "ulid";
import { addDays, dateRange, daysBetween } from "@raah/shared/dates";
import { inr } from "@raah/shared/money";
import { newNodeId, type IdSource, type NodeId } from "../ids";
import {
  parsePlanGraph,
  type Block,
  type Day,
  type EnergyRating,
  type LineItem,
  type MealSlot,
  type PlanGraph,
  type Stay,
  type StayAssignment,
  type Stop,
  type TransitLeg,
} from "../schema";

/**
 * Test/fixture builders. NOT part of the runtime API — imported by tests
 * across the repo and by the fixture generator script. Deterministic when
 * given a seeded IdSource.
 */

/** Deterministic ULID source: seeded PRNG + fixed timestamp. */
export function seededIds(seed = 42): IdSource {
  let s = seed >>> 0;
  const prng = () => {
    // mulberry32 — tiny, deterministic, good enough for test ids
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const factory = monotonicFactory(prng);
  return () => factory(1_750_000_000_000);
}

/** Smallest schema-valid graph: empty trip shell with the three singleton nodes. */
export function minimalGraph(ids: IdSource = seededIds()): PlanGraph {
  return parsePlanGraph({
    meta: {
      trip_id: "trip-test",
      version: 1,
      profile_version: 1,
      status: "draft",
    },
    concept: {
      node_id: newNodeId("concept", ids),
      title: "Test trip",
      narrative: "A minimal test concept.",
      region_strategy: "single-region",
    },
    budget: {
      node_id: newNodeId("ledger", ids),
      total: inr(0),
    },
    packing: { node_id: newNodeId("packing", ids) },
  });
}

// ── low-level node builders (constraints tests override freely) ─────────────

export function makeBlock(ids: IdSource, overrides: Partial<Block> = {}): Block {
  return {
    node_id: newNodeId("block", ids),
    kind: "experience",
    time_window: { start: "09:30", end: "11:30" },
    title: "City Palace courtyards",
    duration_minutes: 120,
    cost: inr(700),
    reasoning: {
      summary: "You rated architecture 4/5",
      profile_refs: [],
      tradeoffs_considered: [],
    },
    links: [],
    tags: [],
    tradeoff_flagged: false,
    sources: [{ kind: "kb", id: "test-fixture" }],
    verify_flag: false,
    alternatives: [],
    locks: "none",
    ...overrides,
  };
}

export function makeMeal(ids: IdSource, overrides: Partial<MealSlot> = {}): MealSlot {
  return {
    node_id: newNodeId("meal", ids),
    slot: "lunch",
    venue: "LMB, Johari Bazaar",
    dishes: ["dal baati churma"],
    diet_flags: ["veg"],
    cost: inr(500),
    links: [],
    tags: [],
    sources: [{ kind: "kb", id: "test-fixture" }],
    verify_flag: false,
    locks: "none",
    ...overrides,
  };
}

export function makeDay(
  ids: IdSource,
  date: string,
  stopRef: NodeId<"stop">,
  overrides: Partial<Day> = {},
): Day {
  return {
    node_id: newNodeId("day", ids),
    date,
    stop_ref: stopRef,
    energy_rating: "moderate",
    blocks: [],
    meals: [],
    locks: "none",
    ...overrides,
  };
}

export function makeStay(overrides: Partial<Stay> = {}): Stay {
  return {
    name: "Haveli test stay",
    style_tags: ["heritage"],
    price_per_night: inr(6000),
    links: [],
    sources: [{ kind: "kb", id: "test-fixture" }],
    verify_flag: false,
    ...overrides,
  };
}

// ── whole-graph builder ──────────────────────────────────────────────────────

export interface StopSpec {
  name: string;
  nights: number;
  region?: string;
  /** KB slug when the stop itself is a known entity (e.g. a park). */
  kb_ref?: string;
  stayPricePerNight?: number;
  /** Transit into this stop (from the previous one). Ignored on the first stop. */
  legMode?: TransitLeg["mode"];
  legMinutes?: number;
}

export interface BuildGraphSpec {
  trip_id?: string;
  /** Trip start date (arrival at the first stop). */
  start: string;
  stops: StopSpec[];
  ids?: IdSource;
  /** Blocks per day (default 2). */
  blocksPerDay?: number;
  withMeals?: boolean;
  energyFor?: (dayIndex: number) => EnergyRating;
  statedBudget?: number;
}

/**
 * Builds a complete, invariant-clean PlanGraph: chained stops, contiguous days
 * (boundary dates belong to the arriving stop), stays with 2 alternates, legs
 * between consecutive stops, and a ledger whose line items reference real nodes.
 */
export function buildGraph(spec: BuildGraphSpec): PlanGraph {
  const ids = spec.ids ?? seededIds();
  const blocksPerDay = spec.blocksPerDay ?? 2;
  const withMeals = spec.withMeals ?? true;

  const stops: Stop[] = [];
  let cursor = spec.start;
  for (const s of spec.stops) {
    const arrive = cursor;
    const depart = addDays(arrive, s.nights);
    stops.push({
      node_id: newNodeId("stop", ids),
      place: { name: s.name, region: s.region, kb_ref: s.kb_ref },
      arrive,
      depart,
      nights: s.nights,
      rationale: {
        summary: `${s.name} anchors this leg of the route`,
        profile_refs: [],
        tradeoffs_considered: [],
      },
      locks: "none",
    });
    cursor = depart;
  }
  const end = cursor;

  // Boundary dates (depart of stop i == arrive of stop i+1) go to the arriving stop.
  const stopForDate = (date: string): Stop => {
    const covering = [...stops].reverse().find((s) => date >= s.arrive && date <= s.depart);
    if (!covering) throw new Error(`No stop covers date ${date}`);
    return covering;
  };

  const days: Day[] = dateRange(spec.start, end).map((date, i) => {
    const stop = stopForDate(date);
    const blocks: Block[] = Array.from({ length: blocksPerDay }, (_, b) =>
      makeBlock(ids, {
        title: `${stop.place.name} experience ${b + 1}`,
        time_window: b === 0 ? { start: "09:30", end: "11:30" } : { start: "15:00", end: "17:00" },
        place_ref: { name: stop.place.name, region: stop.place.region },
      }),
    );
    const meals: MealSlot[] = withMeals
      ? [
          makeMeal(ids, { slot: "lunch", venue: `${stop.place.name} lunch spot` }),
          makeMeal(ids, {
            slot: "dinner",
            venue: `${stop.place.name} dinner spot`,
            cost: inr(800),
          }),
        ]
      : [];
    return makeDay(ids, date, stop.node_id, {
      theme: `${stop.place.name} day`,
      energy_rating: spec.energyFor?.(i) ?? "moderate",
      blocks,
      meals,
    });
  });

  const stays: StayAssignment[] = stops.map((stop, i) => ({
    node_id: newNodeId("stay", ids),
    stop_ref: stop.node_id,
    primary: makeStay({
      name: `${stop.place.name} heritage stay`,
      price_per_night: inr(spec.stops[i]?.stayPricePerNight ?? 6000),
    }),
    alternates: [
      makeStay({
        name: `${stop.place.name} budget stay`,
        price_per_night: inr(2500),
        style_tags: ["homestay"],
      }),
      makeStay({
        name: `${stop.place.name} splurge stay`,
        price_per_night: inr(18000),
        style_tags: ["luxury"],
      }),
    ],
    reasoning: {
      summary: "Matches your heritage stay preference",
      profile_refs: ["taste.stay_styles"],
      tradeoffs_considered: [],
    },
    locks: "none",
  }));

  const legs: TransitLeg[] = stops.slice(1).map((to, i) => {
    const from = stops[i];
    if (!from) throw new Error("unreachable: slice(1) guarantees a predecessor");
    const mode = spec.stops[i + 1]?.legMode ?? "car";
    const minutes = spec.stops[i + 1]?.legMinutes ?? 240;
    return {
      node_id: newNodeId("leg", ids),
      from_stop_ref: from.node_id,
      to_stop_ref: to.node_id,
      mode,
      depart_date: to.arrive,
      depart_time: "09:00",
      realistic_duration_minutes: minutes,
      ...(mode === "train"
        ? {
            service_ref: "12956",
            operator: "Indian Railways",
            class_options: ["2A", "3A"],
            recommended_class: "2A",
            booking: {
              channel: "irctc",
              opens_at: addDays(to.arrive, -60),
              waitlist_risk: "medium" as const,
            },
          }
        : {}),
      links: [],
      cost: inr(mode === "flight" ? 6500 : 3500),
      reasoning: {
        summary: `${from.place.name} → ${to.place.name} within your daily travel ceiling`,
        profile_refs: ["constraints.max_daily_travel_hours"],
        tradeoffs_considered: [],
      },
      tags: [],
      sources: [{ kind: "kb", id: "test-fixture" }],
      verify_flag: false,
      class_options: mode === "train" ? ["2A", "3A"] : [],
      locks: "none",
    };
  });

  const lineItems: LineItem[] = [
    ...stays.flatMap((stay): LineItem[] => {
      const stop = stops.find((s) => s.node_id === stay.stop_ref);
      if (!stop) return [];
      return [
        {
          node_id: newNodeId("line_item", ids),
          node_ref: stay.node_id,
          category: "stays",
          label: `${stay.primary.name} × ${stop.nights} nights`,
          amount: inr(stay.primary.price_per_night.amount * stop.nights),
          confidence: "estimate",
        },
      ];
    }),
    ...legs.map((leg): LineItem => ({
      node_id: newNodeId("line_item", ids),
      node_ref: leg.node_id,
      category: "transport",
      label: "Inter-city leg",
      amount: leg.cost,
      confidence: "estimate",
      date: leg.depart_date,
    })),
  ];
  const total = lineItems.reduce((sum, li) => sum + li.amount.amount, 0);

  const graph: PlanGraph = {
    meta: {
      trip_id: spec.trip_id ?? "trip-test",
      version: 1,
      profile_version: 1,
      status: "draft",
    },
    concept: {
      node_id: newNodeId("concept", ids),
      title: `${spec.stops.map((s) => s.name).join(" → ")}`,
      narrative: "Depth over breadth: fewer bases, more time in each.",
      region_strategy: spec.stops[0]?.region ?? "multi-region",
      discarded_alternatives: [],
    },
    route: stops,
    days,
    stays,
    legs,
    budget: {
      node_id: newNodeId("ledger", ids),
      line_items: lineItems,
      totals_by_category: {
        stays: inr(
          lineItems.filter((l) => l.category === "stays").reduce((s, l) => s + l.amount.amount, 0),
        ),
        transport: inr(
          lineItems
            .filter((l) => l.category === "transport")
            .reduce((s, l) => s + l.amount.amount, 0),
        ),
      },
      total: inr(total),
      vs_stated: spec.statedBudget ? { stated: inr(spec.statedBudget) } : {},
      tradeoffs: [],
    },
    risk: legs.map((leg) => ({
      node_id: newNodeId("risk", ids),
      target_ref: leg.node_id,
      probability: 0.15,
      cause: "Seasonal disruption risk on this sector",
      plan_b: { summary: "Fall back to a morning bus via the highway route", node_refs: [] },
    })),
    pretrip: [
      {
        node_id: newNodeId("pretrip", ids),
        due: addDays(spec.start, -60),
        offset_days: -60,
        label: "Book trains (IRCTC window opens)",
        kind: "booking",
        tags: [],
        refs: [],
        links: [],
      },
    ],
    packing: {
      node_id: newNodeId("packing", ids),
      items: [{ label: "Modest-dress layers for religious sites", tags: ["dress-code"] }],
    },
  };

  // Wire leg fallbacks to their risk entries.
  for (const leg of graph.legs) {
    const risk = graph.risk.find((r) => r.target_ref === leg.node_id);
    if (risk) leg.fallback_ref = risk.node_id;
  }

  // nights sanity: recompute from dates so specs can't drift.
  for (const stop of graph.route) {
    stop.nights = daysBetween(stop.arrive, stop.depart);
  }

  return parsePlanGraph(graph);
}
