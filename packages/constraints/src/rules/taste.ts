import type { Rule, RuleFinding } from "../engine";

/** Pace at or below this = a "savour it" traveller (PS: pace ≤ 0.4). */
export const LOW_PACE_THRESHOLD = 0.4;
export const MAX_CONSECUTIVE_FULL_DAYS = 2;
/** Blocks starting earlier than this violate an "early_mornings" anti-pref. */
export const EARLY_MORNING_CUTOFF = "06:30";

/**
 * pace-energy (blocking): for a low-pace profile, never more than two
 * consecutive "full" energy days.
 */
export const paceEnergyRule: Rule = {
  id: "pace-energy",
  severity: "blocking",
  description: "No >2 consecutive full-energy days when profile pace ≤ 0.4",
  check: ({ graph, profile }) => {
    const pace = profile.taste.pace;
    if (pace === undefined || pace > LOW_PACE_THRESHOLD) return [];
    const findings: RuleFinding[] = [];
    const days = [...graph.days].sort((a, b) => (a.date < b.date ? -1 : 1));
    let streak: typeof days = [];
    const flush = () => {
      if (streak.length > MAX_CONSECUTIVE_FULL_DAYS) {
        findings.push({
          node_refs: streak.map((d) => d.node_id),
          message: `${streak.length} consecutive full-energy days (${streak[0]?.date} → ${streak.at(-1)?.date}) against a stated pace of ${pace}`,
          machine_fix_hint: "Downgrade one of these days to moderate/light or insert a rest block",
          data: { dates: streak.map((d) => d.date), pace },
        });
      }
      streak = [];
    };
    for (const day of days) {
      if (day.energy_rating === "full") streak.push(day);
      else flush();
    }
    flush();
    return findings;
  },
};

/**
 * anti-preference (blocking, PS §15.5): the graph must not contain nodes
 * tagged with a profile anti-preference unless explicitly trade-off-flagged.
 * "early_mornings" is also enforced on block start times, tag or no tag.
 */
export const antiPreferenceRule: Rule = {
  id: "anti-preference",
  severity: "blocking",
  description: "Anti-preferences are never violated without an explicit flagged trade-off",
  check: ({ graph, profile }) => {
    const anti = new Set(profile.taste.anti);
    if (anti.size === 0) return [];
    const findings: RuleFinding[] = [];

    for (const day of graph.days) {
      for (const block of day.blocks) {
        const hits = block.tags.filter((t) => anti.has(t));
        if (
          anti.has("early_mornings") &&
          block.time_window.start < EARLY_MORNING_CUTOFF &&
          !hits.includes("early_mornings")
        ) {
          hits.push("early_mornings");
        }
        if (hits.length > 0 && !block.tradeoff_flagged) {
          findings.push({
            node_refs: [block.node_id, day.node_id],
            message: `"${block.title}" violates anti-preference(s) ${hits.join(", ")} without a flagged trade-off`,
            machine_fix_hint:
              "Replace the block, or set tradeoff_flagged=true with the trade-off stated in reasoning",
            data: { anti_hits: hits },
          });
        }
      }
      for (const meal of day.meals) {
        const hits = meal.tags.filter((t) => anti.has(t));
        if (hits.length > 0) {
          findings.push({
            node_refs: [meal.node_id, day.node_id],
            message: `Meal at "${meal.venue}" violates anti-preference(s) ${hits.join(", ")}`,
            machine_fix_hint: "Choose a different venue",
            data: { anti_hits: hits },
          });
        }
      }
    }
    for (const leg of graph.legs) {
      const hits = leg.tags.filter((t) => anti.has(t));
      if (hits.length > 0) {
        findings.push({
          node_refs: [leg.node_id],
          message: `Transit leg violates anti-preference(s) ${hits.join(", ")}`,
          machine_fix_hint: "Choose a different mode/timing for this leg",
          data: { anti_hits: hits },
        });
      }
    }
    return findings;
  },
};
