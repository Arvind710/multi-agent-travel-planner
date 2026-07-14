import { addDays, istToday } from "@raah/shared/dates";
import type { Rule, RuleFinding } from "../engine";

/** IRCTC advance reservation period. */
export const RAIL_BOOKING_WINDOW_DAYS = 60;

/**
 * rail-booking-window (warning): train legs must carry correct booking-window
 * math (`opens_at = depart − 60d`), and high waitlist risk demands a fallback.
 */
export const railBookingWindowRule: Rule = {
  id: "rail-booking-window",
  severity: "warning",
  description: "Train legs carry correct IRCTC window math and waitlist fallbacks",
  check: ({ graph, today }) => {
    const findings: RuleFinding[] = [];
    const now = today ?? istToday();
    for (const leg of graph.legs) {
      if (leg.mode !== "train") continue;
      const expectedOpen = addDays(leg.depart_date, -RAIL_BOOKING_WINDOW_DAYS);
      if (!leg.booking) {
        findings.push({
          node_refs: [leg.node_id],
          message: `Train leg has no booking info — IRCTC window opens ${expectedOpen}`,
          machine_fix_hint: `Set booking {channel:"irctc", opens_at:"${expectedOpen}"}`,
          data: { expected_opens_at: expectedOpen },
        });
        continue;
      }
      if (leg.booking.opens_at !== undefined && leg.booking.opens_at !== expectedOpen) {
        findings.push({
          node_refs: [leg.node_id],
          message: `Booking window says opens ${leg.booking.opens_at}, but the ${RAIL_BOOKING_WINDOW_DAYS}-day rule gives ${expectedOpen}`,
          machine_fix_hint: `Set booking.opens_at to ${expectedOpen}`,
          data: { expected_opens_at: expectedOpen, stated: leg.booking.opens_at },
        });
      }
      if (leg.booking.waitlist_risk === "high" && !leg.fallback_ref) {
        findings.push({
          node_refs: [leg.node_id],
          message: "High waitlist risk with no plan-B fallback attached",
          machine_fix_hint:
            "Add a FragileLeg risk entry with a concrete fallback and set leg.fallback_ref",
        });
      }
      if (
        leg.booking.opens_at !== undefined &&
        now < leg.booking.opens_at &&
        !leg.booking.urgency
      ) {
        findings.push({
          node_refs: [leg.node_id],
          message: `Booking not yet open (opens ${leg.booking.opens_at}) — pretrip guidance should say when to book`,
          machine_fix_hint: `Set booking.urgency, e.g. "book on ${leg.booking.opens_at} — day one of the window"`,
        });
      }
    }
    return findings;
  },
};

/**
 * max-daily-travel (blocking): no day exceeds the profile's travel-hours cap.
 * Travel minutes per date = max(sum of transit blocks, sum of legs departing
 * that date) — legs usually mirror a transit block, so summing both would
 * double-count.
 */
export const maxDailyTravelRule: Rule = {
  id: "max-daily-travel",
  severity: "blocking",
  description: "Daily travel time within profile.constraints.max_daily_travel_hours",
  check: ({ graph, profile }) => {
    const cap = profile.constraints.max_daily_travel_hours;
    if (cap === undefined) return [];
    const findings: RuleFinding[] = [];
    for (const day of graph.days) {
      const blockMinutes = day.blocks
        .filter((b) => b.kind === "transit")
        .reduce((sum, b) => sum + b.duration_minutes, 0);
      const legs = graph.legs.filter((l) => l.depart_date === day.date);
      const legMinutes = legs.reduce((sum, l) => sum + l.realistic_duration_minutes, 0);
      const total = Math.max(blockMinutes, legMinutes);
      if (total > cap * 60) {
        findings.push({
          node_refs: [day.node_id, ...legs.map((l) => l.node_id)],
          message: `${day.date} has ${(total / 60).toFixed(1)}h of travel — over the ${cap}h ceiling`,
          machine_fix_hint: "Split the journey, add an overnight stop, or switch to a faster mode",
          data: { travel_minutes: total, cap_hours: cap },
        });
      }
    }
    return findings;
  },
};
