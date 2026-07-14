import { weekdayOf } from "@raah/shared/dates";
import type { Rule, RuleFinding } from "../engine";

const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** monument-closure (blocking): never schedule a monument on its closure day (Taj: Fridays). */
export const monumentClosureRule: Rule = {
  id: "monument-closure",
  severity: "blocking",
  description: "No block may visit a monument on its weekly/holiday closure date",
  check: ({ graph, kb }) => {
    const findings: RuleFinding[] = [];
    for (const day of graph.days) {
      for (const block of day.blocks) {
        const slug = block.place_ref?.kb_ref;
        const monument = slug ? kb.monument(slug) : null;
        if (!monument) continue;
        const weekday = weekdayOf(day.date);
        if (monument.closed_weekdays.includes(weekday)) {
          findings.push({
            node_refs: [block.node_id, day.node_id],
            message: `"${block.title}" is scheduled on a ${WEEKDAYS[weekday]} — ${slug} is closed on ${WEEKDAYS[weekday]}s`,
            machine_fix_hint: `Move this block to a different day of the week`,
            data: { monument: slug, weekday },
          });
        } else if (monument.closed_dates?.includes(day.date)) {
          findings.push({
            node_refs: [block.node_id, day.node_id],
            message: `"${block.title}" is scheduled on ${day.date} — ${slug} is closed that date`,
            machine_fix_hint: `Move this block off ${day.date}`,
            data: { monument: slug, date: day.date },
          });
        }
      }
    }
    return findings;
  },
};
