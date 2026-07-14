import { describe, expect, it } from "vitest";
import {
  applyProfileDelta,
  emptyProfile,
  ProfileDeltaError,
  statedBudget,
  TravellerProfile,
} from "./profile";

describe("TravellerProfile schema", () => {
  it("builds an all-defaults profile", () => {
    const p = emptyProfile();
    expect(p.profile_version).toBe(1);
    expect(p.party.adults).toBe(1);
    expect(p.constraints.altitude_ok).toBe("unknown");
    expect(p.output_prefs.language).toBe("en");
    expect(p.provenance).toEqual({});
  });

  it("parses the PS §4.4 shaped profile", () => {
    const p = TravellerProfile.parse({
      profile_version: 3,
      trip: {
        dates: { start: "2026-12-05", end: "2026-12-19", flexibility_days: 3, confidence: 0.9 },
        origin: { city: "London", country: "GB" },
        entry_exit: { entry: "DEL", exit: "auto", confidence: 0.7 },
        anchors: [
          { place: "Udaipur", dates: ["2026-12-14", "2026-12-16"], event: "wedding", hard: true },
        ],
      },
      party: { adults: 2 },
      budget: { total: 350000, currency: "INR", tier: "upper-mid" },
      taste: {
        pace: 0.3,
        interests: { food: 5, architecture: 4 },
        anti: ["crowds", "early_mornings"],
        crowd_tolerance: 0.2,
        stay_styles: ["heritage", "boutique"],
        food: { diet: "none", spice: 0.7, street_food: true },
        experience_level: "first_time",
      },
      constraints: {
        transport_floor: ["flights", "ac_trains", "private_car"],
        max_daily_travel_hours: 5,
        visa: { nationality: "GB", evisa_eligible: true, status: "not_applied" },
      },
      provenance: { "taste.pace": "clarifying_q2", "trip.dates": "nl_parse" },
    });
    expect(p.taste.anti).toContain("crowds");
    expect(p.trip.anchors[0]?.hard).toBe(true);
    expect(statedBudget(p.budget)).toEqual({ amount: 350000, currency: "INR" });
  });

  it("rejects bad provenance sources and out-of-range values", () => {
    expect(TravellerProfile.safeParse({ provenance: { x: "guessed" } }).success).toBe(false);
    expect(TravellerProfile.safeParse({ taste: { pace: 1.5 } }).success).toBe(false);
    expect(TravellerProfile.safeParse({ taste: { interests: { food: 9 } } }).success).toBe(false);
  });

  it("statedBudget returns null when no total given", () => {
    expect(statedBudget(emptyProfile().budget)).toBeNull();
  });
});

describe("applyProfileDelta", () => {
  it("applies deltas immutably, records provenance, bumps version", () => {
    const p1 = emptyProfile();
    const p2 = applyProfileDelta(p1, [
      { path: "taste.pace", value: 0.3, provenance: "clarifying_q2" },
      { path: "trip.dates.start", value: "2026-12-05", provenance: "nl_parse" },
      { path: "taste.anti", value: ["crowds"], provenance: "inferred_from_edit" },
    ]);
    expect(p1.taste.pace).toBeUndefined(); // original untouched
    expect(p2.profile_version).toBe(2);
    expect(p2.taste.pace).toBe(0.3);
    expect(p2.trip.dates.start).toBe("2026-12-05");
    expect(p2.provenance["taste.pace"]).toBe("clarifying_q2");
    expect(p2.provenance["taste.anti"]).toBe("inferred_from_edit");
  });

  it("supports unsetting a field with undefined", () => {
    const p1 = applyProfileDelta(emptyProfile(), [
      { path: "taste.pace", value: 0.4, provenance: "form" },
    ]);
    const p2 = applyProfileDelta(p1, [
      { path: "taste.pace", value: undefined, provenance: "form" },
    ]);
    expect(p2.taste.pace).toBeUndefined();
    expect(p2.profile_version).toBe(3);
  });

  it("no-op on empty delta list", () => {
    const p = emptyProfile();
    expect(applyProfileDelta(p, [])).toBe(p);
  });

  it("rejects invalid values via schema re-validation", () => {
    expect(() =>
      applyProfileDelta(emptyProfile(), [{ path: "taste.pace", value: 7, provenance: "form" }]),
    ).toThrow(ProfileDeltaError);
  });

  it("rejects managed and dangerous paths", () => {
    expect(() =>
      applyProfileDelta(emptyProfile(), [
        { path: "profile_version", value: 99, provenance: "form" },
      ]),
    ).toThrow(ProfileDeltaError);
    expect(() =>
      applyProfileDelta(emptyProfile(), [
        { path: "provenance.taste", value: "form", provenance: "form" },
      ]),
    ).toThrow(ProfileDeltaError);
    expect(() =>
      applyProfileDelta(emptyProfile(), [
        { path: "__proto__.polluted", value: true, provenance: "form" },
      ]),
    ).toThrow(ProfileDeltaError);
  });
});
