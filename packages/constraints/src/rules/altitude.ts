import type { Rule, RuleFinding } from "../engine";
import { placeSlug } from "./helpers";

/** Above this sleeping altitude, acclimatization rules apply. */
export const HIGH_ALTITUDE_M = 3000;
/** Max sleeping-altitude gain per day above the threshold. */
export const MAX_DAILY_GAIN_M = 500;

/**
 * altitude-acclimatization (blocking, ARCH §7.3):
 * 1. No sleeping-altitude gain > 500m/day once above 3,000m.
 * 2. The first day at a ≥3,000m stop (arriving from below) must be a rest
 *    day — energy_rating "light" (the Leh arrival rule).
 */
export const altitudeAcclimatizationRule: Rule = {
  id: "altitude-acclimatization",
  severity: "blocking",
  description: "Sleeping-altitude gain ≤500m/day above 3000m; rest day on high-altitude arrival",
  check: ({ graph, kb }) => {
    const findings: RuleFinding[] = [];

    const altitudeOf = (stopRef: string): number | null => {
      const stop = graph.route.find((s) => s.node_id === stopRef);
      return stop ? kb.sleepingAltitudeM(placeSlug(stop)) : null;
    };

    // 1. daily sleeping-altitude gains along the day sequence
    const days = [...graph.days].sort((a, b) => (a.date < b.date ? -1 : 1));
    for (let i = 1; i < days.length; i++) {
      const prev = days[i - 1];
      const next = days[i];
      if (!prev || !next || prev.stop_ref === next.stop_ref) continue;
      const prevAlt = altitudeOf(prev.stop_ref);
      const nextAlt = altitudeOf(next.stop_ref);
      if (prevAlt === null || nextAlt === null) continue;
      if (prevAlt >= HIGH_ALTITUDE_M && nextAlt - prevAlt > MAX_DAILY_GAIN_M) {
        findings.push({
          node_refs: [next.node_id, next.stop_ref],
          message: `Sleeping altitude jumps ${prevAlt}m → ${nextAlt}m on ${next.date} — above ${HIGH_ALTITUDE_M}m the safe gain is ≤${MAX_DAILY_GAIN_M}m/day`,
          machine_fix_hint:
            "Insert an intermediate acclimatization night or reorder stops to ascend gradually",
          data: { from_m: prevAlt, to_m: nextAlt, gain_m: nextAlt - prevAlt },
        });
      }
    }

    // 2. arrival rest day at high altitude
    for (const stop of graph.route) {
      const alt = kb.sleepingAltitudeM(placeSlug(stop));
      if (alt === null || alt < HIGH_ALTITUDE_M) continue;
      const idx = graph.route.findIndex((s) => s.node_id === stop.node_id);
      const prevStop = idx > 0 ? graph.route[idx - 1] : undefined;
      const prevAlt = prevStop ? kb.sleepingAltitudeM(placeSlug(prevStop)) : null;
      const arrivingFromBelow = prevAlt === null || prevAlt < HIGH_ALTITUDE_M - MAX_DAILY_GAIN_M;
      if (!arrivingFromBelow) continue;
      const firstDay = graph.days
        .filter((d) => d.stop_ref === stop.node_id)
        .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      if (firstDay && firstDay.energy_rating !== "light") {
        findings.push({
          node_refs: [firstDay.node_id, stop.node_id],
          message: `First day in ${stop.place.name} (${alt}m) is rated "${firstDay.energy_rating}" — arrival at ≥${HIGH_ALTITUDE_M}m demands a light acclimatization day`,
          machine_fix_hint: `Set day ${firstDay.date} energy_rating to "light" and strip strenuous blocks`,
          data: { altitude_m: alt, date: firstDay.date },
        });
      }
    }

    return findings;
  },
};
