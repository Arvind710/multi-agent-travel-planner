import { describe, expect, it } from "vitest";
import type { PlanGraph } from "@raah/plan-graph";
import { buildGraph, makeBlock, makeMeal, seededIds } from "@raah/plan-graph/testing";
import { emptyProfile, TravellerProfile } from "@raah/shared/profile";
import { weekdayOf } from "@raah/shared/dates";
import { runRules, type ConstraintContext, type Rule } from "./engine";
import { testKb } from "./kb";
import {
  ALL_RULES,
  altitudeAcclimatizationRule,
  antiPreferenceRule,
  budgetBoundsRule,
  festivalCollisionRule,
  maxDailyTravelRule,
  monumentClosureRule,
  paceEnergyRule,
  parkClosureRule,
  permitRequiredRule,
  railBookingWindowRule,
  seasonCautionRule,
  seasonWindowRule,
} from "./rules";

const kb = testKb();

function ctx(graph: PlanGraph, profile = emptyProfile(), today = "2026-01-01"): ConstraintContext {
  return { graph, profile, kb, today };
}

function violationsOf(rule: Rule, c: ConstraintContext) {
  return runRules(c, [rule]).violations;
}

// ── season-window ────────────────────────────────────────────────────────────

describe("season-window", () => {
  it("FAIL: Ladakh road trip in January is closed-season", () => {
    const graph = buildGraph({
      start: "2026-01-10",
      stops: [{ name: "Leh", region: "ladakh", kb_ref: "leh", nights: 3 }],
    });
    const v = violationsOf(seasonWindowRule, ctx(graph));
    expect(v).toHaveLength(1);
    expect(v[0]?.severity).toBe("blocking");
    expect(v[0]?.data?.closed_months).toEqual([1]);
    expect(v[0]?.node_refs).toContain(graph.route[0]?.node_id);
  });

  it("PASS: Ladakh in July is open", () => {
    const graph = buildGraph({
      start: "2026-07-10",
      stops: [{ name: "Leh", region: "ladakh", kb_ref: "leh", nights: 3 }],
    });
    expect(violationsOf(seasonWindowRule, ctx(graph))).toEqual([]);
  });

  it("PASS: unknown regions are not judged", () => {
    const graph = buildGraph({ start: "2026-01-10", stops: [{ name: "Mystery", nights: 2 }] });
    expect(violationsOf(seasonWindowRule, ctx(graph))).toEqual([]);
  });
});

describe("season-caution", () => {
  it("WARN: Rajasthan in May is avoid-season", () => {
    const graph = buildGraph({
      start: "2026-05-10",
      stops: [{ name: "Jaipur", region: "rajasthan", nights: 2 }],
    });
    const v = violationsOf(seasonCautionRule, ctx(graph));
    expect(v).toHaveLength(1);
    expect(v[0]?.severity).toBe("warning");
  });

  it("PASS: Rajasthan in December", () => {
    const graph = buildGraph({
      start: "2026-12-05",
      stops: [{ name: "Jaipur", region: "rajasthan", nights: 2 }],
    });
    expect(violationsOf(seasonCautionRule, ctx(graph))).toEqual([]);
  });
});

// ── permit-required ──────────────────────────────────────────────────────────

describe("permit-required", () => {
  const arunachalTrip = () =>
    buildGraph({
      start: "2026-11-01",
      stops: [{ name: "Ziro", region: "arunachal", nights: 3 }],
    });

  it("FAIL: Arunachal with no permit pretrip item", () => {
    const v = violationsOf(permitRequiredRule, ctx(arunachalTrip()));
    expect(v).toHaveLength(1);
    expect(v[0]?.data?.permit_id).toBe("arunachal-ilp");
    expect(v[0]?.machine_fix_hint).toContain("permit:arunachal-ilp");
    expect(v[0]?.data?.apply_by).toBe("2026-10-18"); // arrive − 14d lead
  });

  it("PASS: permit item with the right tag satisfies the rule", () => {
    const graph = arunachalTrip();
    graph.pretrip.push({
      node_id: "pretrip_01JGXQ2V6H8Z9Y7W5T4R3E2Q1A",
      due: "2026-10-18",
      label: "Apply for Arunachal ILP",
      kind: "permit",
      tags: ["permit:arunachal-ilp"],
      refs: [],
      links: [],
    });
    expect(violationsOf(permitRequiredRule, ctx(graph))).toEqual([]);
  });

  it("nationality-dependent: North Sikkim PAP binds foreigners, not IN nationals", () => {
    const graph = buildGraph({
      start: "2026-04-01",
      stops: [{ name: "Lachen", region: "sikkim-north", nights: 2 }],
    });
    const indian = TravellerProfile.parse({ constraints: { visa: { nationality: "IN" } } });
    const british = TravellerProfile.parse({ constraints: { visa: { nationality: "GB" } } });
    expect(violationsOf(permitRequiredRule, ctx(graph, indian))).toEqual([]);
    const v = violationsOf(permitRequiredRule, ctx(graph, british));
    expect(v).toHaveLength(1);
    expect(v[0]?.data?.permit_id).toBe("sikkim-pap");
  });
});

// ── monument-closure ─────────────────────────────────────────────────────────

describe("monument-closure", () => {
  // 2026-12-11 is a Friday — the Taj Mahal's closure day.
  it("sanity: 2026-12-11 is a Friday", () => {
    expect(weekdayOf("2026-12-11")).toBe(5);
  });

  const agraTrip = (blockDate: string) => {
    const graph = buildGraph({
      start: "2026-12-10",
      stops: [{ name: "Agra", region: "rajasthan", nights: 3 }],
    });
    const day = graph.days.find((d) => d.date === blockDate);
    if (!day) throw new Error("no day");
    day.blocks.push(
      makeBlock(seededIds(50), {
        title: "Taj Mahal at dawn",
        place_ref: { name: "Taj Mahal", kb_ref: "taj-mahal" },
      }),
    );
    return graph;
  };

  it("FAIL: Taj Mahal scheduled on a Friday", () => {
    const v = violationsOf(monumentClosureRule, ctx(agraTrip("2026-12-11")));
    expect(v).toHaveLength(1);
    expect(v[0]?.message).toContain("Friday");
  });

  it("PASS: Taj Mahal on a Saturday", () => {
    expect(violationsOf(monumentClosureRule, ctx(agraTrip("2026-12-12")))).toEqual([]);
  });

  it("FAIL: monument closed on a specific holiday date", () => {
    const graph = buildGraph({
      start: "2026-03-03",
      stops: [{ name: "Jaipur", region: "rajasthan", nights: 2 }],
    });
    const day = graph.days.find((d) => d.date === "2026-03-04");
    if (!day) throw new Error("no day");
    day.blocks.push(
      makeBlock(seededIds(51), {
        title: "City Palace",
        place_ref: { name: "City Palace", kb_ref: "jaipur-city-palace" },
      }),
    );
    const v = violationsOf(monumentClosureRule, ctx(graph));
    expect(v).toHaveLength(1);
    expect(v[0]?.data?.date).toBe("2026-03-04");
  });
});

// ── park-closure ─────────────────────────────────────────────────────────────

describe("park-closure", () => {
  it("FAIL: Ranthambore stop in August (monsoon closure)", () => {
    const graph = buildGraph({
      start: "2026-08-05",
      stops: [{ name: "Ranthambore", region: "rajasthan", kb_ref: "ranthambore", nights: 2 }],
    });
    const v = violationsOf(parkClosureRule, ctx(graph));
    expect(v.length).toBeGreaterThanOrEqual(1);
    expect(v[0]?.data?.closed_months).toContain(8);
  });

  it("FAIL: safari block inside closure months", () => {
    const graph = buildGraph({
      start: "2026-07-10",
      stops: [{ name: "Sawai Madhopur", region: "rajasthan", nights: 2 }],
    });
    graph.days[0]?.blocks.push(
      makeBlock(seededIds(52), {
        title: "Zone 3 safari",
        place_ref: { name: "Ranthambore", kb_ref: "ranthambore" },
      }),
    );
    const v = violationsOf(parkClosureRule, ctx(graph));
    expect(v).toHaveLength(1);
    expect(v[0]?.message).toContain("Zone 3 safari");
  });

  it("PASS: Ranthambore in December", () => {
    const graph = buildGraph({
      start: "2026-12-05",
      stops: [{ name: "Ranthambore", region: "rajasthan", kb_ref: "ranthambore", nights: 2 }],
    });
    expect(violationsOf(parkClosureRule, ctx(graph))).toEqual([]);
  });
});

// ── rail-booking-window ──────────────────────────────────────────────────────

describe("rail-booking-window", () => {
  const trainTrip = () =>
    buildGraph({
      start: "2026-12-05",
      stops: [
        { name: "Jaipur", region: "rajasthan", nights: 2 },
        { name: "Bundi", region: "rajasthan", nights: 2, legMode: "train" },
      ],
    });

  it("PASS: builder legs carry correct 60-day math and fallbacks (needs urgency note pre-window)", () => {
    const graph = trainTrip();
    const leg = graph.legs[0];
    if (!leg?.booking) throw new Error("no train leg");
    // builder sets opens_at = depart − 60; today after window opens → no urgency needed
    const v = violationsOf(railBookingWindowRule, ctx(graph, emptyProfile(), "2026-11-01"));
    expect(v).toEqual([]);
  });

  it("WARN: wrong opens_at date", () => {
    const graph = trainTrip();
    const leg = graph.legs[0];
    if (!leg?.booking) throw new Error("no train leg");
    leg.booking.opens_at = "2026-11-01";
    const v = violationsOf(railBookingWindowRule, ctx(graph, emptyProfile(), "2026-11-01"));
    expect(v).toHaveLength(1);
    expect(v[0]?.data?.expected_opens_at).toBe("2026-10-08"); // 2026-12-07 − 60d
  });

  it("WARN: missing booking info entirely", () => {
    const graph = trainTrip();
    const leg = graph.legs[0];
    if (!leg) throw new Error("no leg");
    delete (leg as { booking?: unknown }).booking;
    const v = violationsOf(railBookingWindowRule, ctx(graph));
    expect(v).toHaveLength(1);
    expect(v[0]?.message).toContain("no booking info");
  });

  it("WARN: high waitlist risk without a fallback; not-yet-open without urgency", () => {
    const graph = trainTrip();
    const leg = graph.legs[0];
    if (!leg?.booking) throw new Error("no train leg");
    leg.booking.waitlist_risk = "high";
    delete (leg as { fallback_ref?: unknown }).fallback_ref;
    const v = violationsOf(railBookingWindowRule, ctx(graph, emptyProfile(), "2026-09-01"));
    expect(v.map((x) => x.message)).toEqual([
      expect.stringContaining("High waitlist risk"),
      expect.stringContaining("not yet open"),
    ]);
  });

  it("PASS: car legs are ignored", () => {
    const graph = buildGraph({
      start: "2026-12-05",
      stops: [
        { name: "Jaipur", region: "rajasthan", nights: 2 },
        { name: "Bundi", region: "rajasthan", nights: 2, legMode: "car" },
      ],
    });
    expect(violationsOf(railBookingWindowRule, ctx(graph))).toEqual([]);
  });
});

// ── altitude-acclimatization ─────────────────────────────────────────────────

describe("altitude-acclimatization", () => {
  it("FAIL: flying into Leh with a full first day (no rest day)", () => {
    const graph = buildGraph({
      start: "2026-07-01",
      stops: [
        { name: "Delhi", kb_ref: "delhi", nights: 1 },
        { name: "Leh", region: "ladakh", kb_ref: "leh", nights: 3, legMode: "flight" },
      ],
      energyFor: () => "full",
    });
    const v = violationsOf(altitudeAcclimatizationRule, ctx(graph));
    expect(v).toHaveLength(1);
    expect(v[0]?.message).toContain("light acclimatization day");
  });

  it("PASS: Leh arrival with a light first day", () => {
    const graph = buildGraph({
      start: "2026-07-01",
      stops: [
        { name: "Delhi", kb_ref: "delhi", nights: 1 },
        { name: "Leh", region: "ladakh", kb_ref: "leh", nights: 3, legMode: "flight" },
      ],
      // day index 1 = Leh arrival (boundary day belongs to the arriving stop)
      energyFor: (i) => (i === 1 ? "light" : "moderate"),
    });
    expect(violationsOf(altitudeAcclimatizationRule, ctx(graph))).toEqual([]);
  });

  it("FAIL: Leh → Pangong Tso jumps 750m above 3000m", () => {
    const graph = buildGraph({
      start: "2026-07-01",
      stops: [
        { name: "Leh", region: "ladakh", kb_ref: "leh", nights: 2 },
        { name: "Pangong Tso", region: "ladakh", kb_ref: "pangong-tso", nights: 1, legMode: "car" },
      ],
      energyFor: (i) => (i === 0 ? "light" : "moderate"),
    });
    const v = violationsOf(altitudeAcclimatizationRule, ctx(graph));
    expect(v.some((x) => x.data?.gain_m === 750)).toBe(true);
  });

  it("PASS: Leh → Nubra descends; no violation", () => {
    const graph = buildGraph({
      start: "2026-07-01",
      stops: [
        { name: "Leh", region: "ladakh", kb_ref: "leh", nights: 2 },
        {
          name: "Nubra Valley",
          region: "ladakh",
          kb_ref: "nubra-valley",
          nights: 1,
          legMode: "car",
        },
      ],
      energyFor: (i) => (i === 0 ? "light" : "moderate"),
    });
    expect(violationsOf(altitudeAcclimatizationRule, ctx(graph))).toEqual([]);
  });

  it("PASS: plains trips never trigger altitude rules", () => {
    const graph = buildGraph({
      start: "2026-12-05",
      stops: [
        { name: "Jaipur", kb_ref: "jaipur", region: "rajasthan", nights: 2 },
        { name: "Delhi", kb_ref: "delhi", nights: 2 },
      ],
      energyFor: () => "full",
    });
    expect(violationsOf(altitudeAcclimatizationRule, ctx(graph))).toEqual([]);
  });
});

// ── max-daily-travel ─────────────────────────────────────────────────────────

describe("max-daily-travel", () => {
  const profileWithCap = TravellerProfile.parse({ constraints: { max_daily_travel_hours: 5 } });

  it("FAIL: an 8-hour drive against a 5-hour ceiling", () => {
    const graph = buildGraph({
      start: "2026-12-05",
      stops: [
        { name: "Jaipur", region: "rajasthan", nights: 2 },
        { name: "Jaisalmer", region: "rajasthan", nights: 2, legMode: "car", legMinutes: 480 },
      ],
    });
    const v = violationsOf(maxDailyTravelRule, ctx(graph, profileWithCap));
    expect(v).toHaveLength(1);
    expect(v[0]?.data?.travel_minutes).toBe(480);
  });

  it("PASS: a 4-hour drive under the same ceiling", () => {
    const graph = buildGraph({
      start: "2026-12-05",
      stops: [
        { name: "Jaipur", region: "rajasthan", nights: 2 },
        { name: "Bundi", region: "rajasthan", nights: 2, legMode: "car", legMinutes: 240 },
      ],
    });
    expect(violationsOf(maxDailyTravelRule, ctx(graph, profileWithCap))).toEqual([]);
  });

  it("PASS: no cap in the profile → rule stands down", () => {
    const graph = buildGraph({
      start: "2026-12-05",
      stops: [
        { name: "Jaipur", region: "rajasthan", nights: 2 },
        { name: "Jaisalmer", region: "rajasthan", nights: 2, legMode: "car", legMinutes: 600 },
      ],
    });
    expect(violationsOf(maxDailyTravelRule, ctx(graph))).toEqual([]);
  });

  it("counts transit blocks when they exceed leg time", () => {
    const graph = buildGraph({
      start: "2026-12-05",
      stops: [{ name: "Jaipur", region: "rajasthan", nights: 2 }],
    });
    graph.days[1]?.blocks.push(
      makeBlock(seededIds(53), { kind: "transit", title: "Day trip drive", duration_minutes: 400 }),
    );
    const v = violationsOf(maxDailyTravelRule, ctx(graph, profileWithCap));
    expect(v).toHaveLength(1);
  });
});

// ── pace-energy ──────────────────────────────────────────────────────────────

describe("pace-energy", () => {
  const threeFullDays = () =>
    buildGraph({
      start: "2026-12-05",
      stops: [{ name: "Jaipur", region: "rajasthan", nights: 3 }],
      energyFor: () => "full",
    });

  it("FAIL: 3+ consecutive full days for a pace-0.3 profile", () => {
    const slow = TravellerProfile.parse({ taste: { pace: 0.3 } });
    const v = violationsOf(paceEnergyRule, ctx(threeFullDays(), slow));
    expect(v).toHaveLength(1);
    expect(v[0]?.node_refs.length).toBeGreaterThanOrEqual(3);
  });

  it("PASS: same days for a pace-0.8 profile", () => {
    const fast = TravellerProfile.parse({ taste: { pace: 0.8 } });
    expect(violationsOf(paceEnergyRule, ctx(threeFullDays(), fast))).toEqual([]);
  });

  it("PASS: a rest day breaks the streak", () => {
    const slow = TravellerProfile.parse({ taste: { pace: 0.3 } });
    const graph = buildGraph({
      start: "2026-12-05",
      stops: [{ name: "Jaipur", region: "rajasthan", nights: 4 }],
      energyFor: (i) => (i === 2 ? "light" : "full"),
    });
    expect(violationsOf(paceEnergyRule, ctx(graph, slow))).toEqual([]);
  });

  it("PASS: pace unstated → rule stands down", () => {
    expect(violationsOf(paceEnergyRule, ctx(threeFullDays()))).toEqual([]);
  });
});

// ── anti-preference ──────────────────────────────────────────────────────────

describe("anti-preference", () => {
  const cromwellProfile = TravellerProfile.parse({
    taste: { anti: ["crowds", "early_mornings", "street_food", "overnight_travel"] },
  });

  const jaipur = () =>
    buildGraph({
      start: "2026-12-05",
      stops: [{ name: "Jaipur", region: "rajasthan", nights: 2 }],
    });

  it("FAIL: block tagged with an anti-preference, unflagged", () => {
    const graph = jaipur();
    graph.days[0]?.blocks.push(
      makeBlock(seededIds(54), { title: "Amber Fort at 11am", tags: ["crowds", "fort"] }),
    );
    const v = violationsOf(antiPreferenceRule, ctx(graph, cromwellProfile));
    expect(v).toHaveLength(1);
    expect(v[0]?.data?.anti_hits).toEqual(["crowds"]);
  });

  it("PASS: same block with an explicit flagged trade-off", () => {
    const graph = jaipur();
    graph.days[0]?.blocks.push(
      makeBlock(seededIds(54), {
        title: "Amber Fort at 11am",
        tags: ["crowds"],
        tradeoff_flagged: true,
      }),
    );
    expect(violationsOf(antiPreferenceRule, ctx(graph, cromwellProfile))).toEqual([]);
  });

  it("FAIL: 05:30 start violates early_mornings even without the tag", () => {
    const graph = jaipur();
    graph.days[0]?.blocks.push(
      makeBlock(seededIds(55), {
        title: "Sunrise hot-air balloon",
        time_window: { start: "05:30", end: "07:00" },
      }),
    );
    const v = violationsOf(antiPreferenceRule, ctx(graph, cromwellProfile));
    expect(v[0]?.data?.anti_hits).toEqual(["early_mornings"]);
  });

  it("FAIL: meal and leg tag violations; PASS with empty anti list", () => {
    const graph = buildGraph({
      start: "2026-12-05",
      stops: [
        { name: "Jaipur", region: "rajasthan", nights: 2 },
        { name: "Jaisalmer", region: "rajasthan", nights: 2, legMode: "train" },
      ],
    });
    graph.days[0]?.meals.push(
      makeMeal(seededIds(56), { venue: "Chaat corner", tags: ["street_food"] }),
    );
    const leg = graph.legs[0];
    if (!leg) throw new Error("no leg");
    leg.tags.push("overnight_travel");
    const v = violationsOf(antiPreferenceRule, ctx(graph, cromwellProfile));
    expect(v.map((x) => x.data?.anti_hits)).toEqual([["street_food"], ["overnight_travel"]]);
    expect(violationsOf(antiPreferenceRule, ctx(graph))).toEqual([]);
  });
});

// ── budget-bounds ────────────────────────────────────────────────────────────

describe("budget-bounds", () => {
  const jaipurWithBudget = (stated?: number) =>
    buildGraph({
      start: "2026-12-05",
      stops: [{ name: "Jaipur", region: "rajasthan", nights: 2 }],
      statedBudget: stated,
    });

  it("FAIL: 25% over stated with no justification", () => {
    const graph = jaipurWithBudget(10000);
    graph.budget.total = { amount: 12500, currency: "INR" };
    const v = violationsOf(budgetBoundsRule, ctx(graph));
    expect(v).toHaveLength(1);
    expect(v[0]?.data?.delta_pct).toBeCloseTo(0.25);
  });

  it("PASS: within ±10%", () => {
    const graph = jaipurWithBudget(10000);
    graph.budget.total = { amount: 10800, currency: "INR" };
    expect(violationsOf(budgetBoundsRule, ctx(graph))).toEqual([]);
  });

  it("PASS: over budget but justified", () => {
    const graph = jaipurWithBudget(10000);
    graph.budget.total = { amount: 13000, currency: "INR" };
    graph.budget.vs_stated.justification =
      "Wedding-week surge in Udaipur — flagged trade-off accepted by user";
    expect(violationsOf(budgetBoundsRule, ctx(graph))).toEqual([]);
  });

  it("FAIL: currency mismatch cannot be verified", () => {
    const graph = jaipurWithBudget();
    graph.budget.vs_stated.stated = { amount: 4000, currency: "GBP" };
    const v = violationsOf(budgetBoundsRule, ctx(graph));
    expect(v[0]?.message).toContain("Cannot verify");
  });

  it("PASS: no stated budget anywhere → stands down; profile budget is used when present", () => {
    expect(violationsOf(budgetBoundsRule, ctx(jaipurWithBudget()))).toEqual([]);
    const profile = TravellerProfile.parse({ budget: { total: 10000, currency: "INR" } });
    const graph = jaipurWithBudget();
    graph.budget.total = { amount: 20000, currency: "INR" };
    expect(violationsOf(budgetBoundsRule, ctx(graph, profile))).toHaveLength(1);
  });
});

// ── date-festival-collision ──────────────────────────────────────────────────

describe("date-festival-collision", () => {
  it("WARN: Pushkar Mela overlaps a Rajasthan stay, deduped per stop", () => {
    const graph = buildGraph({
      start: "2026-11-19",
      stops: [{ name: "Pushkar", region: "rajasthan", nights: 3 }],
    });
    const v = violationsOf(festivalCollisionRule, ctx(graph));
    expect(v).toHaveLength(1); // one per stop×festival, not per day
    expect(v[0]?.data?.surge_factor).toBe(2.2);
    expect(v[0]?.severity).toBe("warning");
  });

  it("WARN: national festivals (Diwali) hit any region", () => {
    const graph = buildGraph({
      start: "2026-11-07",
      stops: [{ name: "Kochi", region: "kerala", nights: 2 }],
    });
    const v = violationsOf(festivalCollisionRule, ctx(graph));
    expect(v.map((x) => x.data?.festival)).toEqual(["diwali-2026"]);
  });

  it("PASS: quiet dates", () => {
    const graph = buildGraph({
      start: "2026-12-05",
      stops: [{ name: "Jaipur", region: "rajasthan", nights: 2 }],
    });
    expect(violationsOf(festivalCollisionRule, ctx(graph))).toEqual([]);
  });
});

// ── engine ───────────────────────────────────────────────────────────────────

describe("runRules engine", () => {
  it("stamps rule ids/severities and computes pass correctly", () => {
    const graph = buildGraph({
      start: "2026-01-10",
      stops: [{ name: "Leh", region: "ladakh", kb_ref: "leh", nights: 2 }],
      energyFor: () => "full",
    });
    const report = runRules(ctx(graph), ALL_RULES);
    expect(report.pass).toBe(false);
    expect(report.blocking.map((v) => v.rule_id)).toContain("season-window");
    expect(report.violations.every((v) => v.rule_id && v.severity)).toBe(true);
    expect(report.warnings.every((v) => v.severity === "warning")).toBe(true);
  });

  it("passes a clean golden-style graph (warnings allowed, zero blocking)", () => {
    const graph = buildGraph({
      start: "2026-12-05",
      stops: [
        { name: "Jaipur", region: "rajasthan", nights: 3 },
        { name: "Bundi", region: "rajasthan", nights: 2, legMode: "train" },
      ],
    });
    const report = runRules(ctx(graph, emptyProfile(), "2026-11-01"), ALL_RULES);
    expect(report.blocking).toEqual([]);
    expect(report.pass).toBe(true);
  });
});
