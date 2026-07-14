import { addDays } from "@raah/shared/dates";
import type { Rule, RuleFinding } from "../engine";

/**
 * permit-required (blocking): every KB-required permit for a routed region ×
 * traveller nationality must have a matching pre-trip item
 * (kind "permit", tag `permit:<permit_id>`).
 */
export const permitRequiredRule: Rule = {
  id: "permit-required",
  severity: "blocking",
  description: "Required regional permits must appear in the pre-trip timeline",
  check: ({ graph, profile, kb }) => {
    const findings: RuleFinding[] = [];
    const nationality = profile.constraints.visa.nationality;
    const covered = new Set(
      graph.pretrip
        .filter((item) => item.kind === "permit")
        .flatMap((item) => item.tags.filter((t) => t.startsWith("permit:"))),
    );
    const reported = new Set<string>();
    for (const stop of graph.route) {
      if (!stop.place.region) continue;
      for (const permit of kb.permitsFor(stop.place.region, nationality)) {
        if (covered.has(`permit:${permit.permit_id}`) || reported.has(permit.permit_id)) continue;
        reported.add(permit.permit_id);
        const applyBy = addDays(stop.arrive, -permit.lead_time_days);
        findings.push({
          node_refs: [stop.node_id],
          message: `${stop.place.name} requires the ${permit.name}${nationality ? ` for ${nationality} nationals` : ""}, but the pre-trip timeline has no permit item for it`,
          machine_fix_hint: `Add a pretrip item: kind "permit", tag "permit:${permit.permit_id}", due ${applyBy} (${permit.lead_time_days}d lead), channel: ${permit.channel}`,
          data: {
            permit_id: permit.permit_id,
            lead_time_days: permit.lead_time_days,
            apply_by: applyBy,
          },
        });
      }
    }
    return findings;
  },
};
