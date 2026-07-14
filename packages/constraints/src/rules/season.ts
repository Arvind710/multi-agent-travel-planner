import { monthOf } from "@raah/shared/dates";
import type { Rule, RuleFinding } from "../engine";
import { monthsOfStop, stopOfDay } from "./helpers";

/**
 * season-window (blocking): a stop must never sit in a "closed" window
 * (Ladakh road routes in January); "avoid" windows surface as a separate
 * warning rule would — here they block only when closed, and are reported
 * with severity via two rules for clean machine feedback.
 */
export const seasonWindowRule: Rule = {
  id: "season-window",
  severity: "blocking",
  description: "No stop may fall in a KB-closed season window for its region",
  check: ({ graph, kb }) => {
    const findings: RuleFinding[] = [];
    for (const stop of graph.route) {
      if (!stop.place.region) continue;
      const closedMonths = monthsOfStop(stop).filter(
        (m) => kb.seasonStatus(stop.place.region ?? "", m) === "closed",
      );
      if (closedMonths.length > 0) {
        findings.push({
          node_refs: [stop.node_id],
          message: `${stop.place.name} (${stop.place.region}) is closed-season in month(s) ${closedMonths.join(", ")} — routes/access are shut`,
          machine_fix_hint: `Replace this stop or move the trip out of month(s) ${closedMonths.join(", ")}`,
          data: { region: stop.place.region, closed_months: closedMonths },
        });
      }
    }
    return findings;
  },
};

/** season-caution (warning): "avoid" windows (monsoon, heat) — plan may ship with the trade-off stated. */
export const seasonCautionRule: Rule = {
  id: "season-caution",
  severity: "warning",
  description: "Flag stops in KB-avoid season windows (monsoon/heat)",
  check: ({ graph, kb }) => {
    const findings: RuleFinding[] = [];
    for (const stop of graph.route) {
      if (!stop.place.region) continue;
      const avoidMonths = monthsOfStop(stop).filter(
        (m) => kb.seasonStatus(stop.place.region ?? "", m) === "avoid",
      );
      if (avoidMonths.length > 0) {
        findings.push({
          node_refs: [stop.node_id],
          message: `${stop.place.name} falls in an avoid-season window (month(s) ${avoidMonths.join(", ")})`,
          data: { region: stop.place.region, avoid_months: avoidMonths },
        });
      }
    }
    return findings;
  },
};

/** park-closure (blocking): no park visit during its closed months (most: Jul–Sep). */
export const parkClosureRule: Rule = {
  id: "park-closure",
  severity: "blocking",
  description: "No park stop/block during the park's closed months",
  check: ({ graph, kb }) => {
    const findings: RuleFinding[] = [];
    for (const stop of graph.route) {
      const park = stop.place.kb_ref ? kb.park(stop.place.kb_ref) : null;
      if (!park) continue;
      const hit = monthsOfStop(stop).filter((m) => park.closed_months.includes(m));
      if (hit.length > 0) {
        findings.push({
          node_refs: [stop.node_id],
          message: `${stop.place.name} is closed in month(s) ${hit.join(", ")}`,
          machine_fix_hint: "Drop the park or reschedule outside its closure season",
          data: { park: stop.place.kb_ref, closed_months: hit },
        });
      }
    }
    for (const day of graph.days) {
      for (const block of day.blocks) {
        const slug = block.place_ref?.kb_ref;
        const park = slug ? kb.park(slug) : null;
        if (!park) continue;
        if (park.closed_months.includes(monthOf(day.date))) {
          findings.push({
            node_refs: [block.node_id, day.node_id],
            message: `"${block.title}" is scheduled on ${day.date}, inside ${slug}'s closed season`,
            machine_fix_hint: "Replace this block or move it to an open month",
            data: { park: slug, date: day.date },
          });
        }
      }
    }
    return findings;
  },
};

/** date-festival-collision (warning): surge windows surfaced with data (PS §5.1). */
export const festivalCollisionRule: Rule = {
  id: "date-festival-collision",
  severity: "warning",
  description: "Flag days colliding with festival surge windows (pricing/crowds)",
  check: ({ graph, kb }) => {
    const findings: RuleFinding[] = [];
    const seen = new Set<string>();
    for (const day of graph.days) {
      const stop = stopOfDay(graph, day);
      const hits = kb.festivalsOn(day.date, stop?.place.region);
      for (const hit of hits) {
        if (hit.surge_factor < 1.2) continue;
        const key = `${day.stop_ref}:${hit.slug}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          node_refs: [day.node_id, day.stop_ref],
          message: `${hit.name} overlaps this stay (${day.date}) — expect ~${hit.surge_factor}× pricing and heavy crowds`,
          machine_fix_hint: "Ask the user: lean into the festival, or shift dates/stop",
          data: { festival: hit.slug, surge_factor: hit.surge_factor },
        });
      }
    }
    return findings;
  },
};
