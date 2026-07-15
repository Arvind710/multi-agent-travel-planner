import { runRules, ALL_RULES, type ConstraintKb } from "@raah/constraints";
import type { PlanGraph } from "@raah/plan-graph";
import type { PipelineState, CriticReport } from "./runtime";

/**
 * The gate runs mid-pipeline on a partially built graph (first pass sees only
 * concept + route skeleton); rules iterate every section, so absent ones are
 * filled with empty defaults.
 */
function normalizeForRules(graph: PipelineState["graph"]): PlanGraph {
  return {
    meta: graph?.meta ?? { trip_id: "gate", version: 1, profile_version: 1, status: "draft" },
    concept: graph?.concept,
    route: graph?.route ?? [],
    days: graph?.days ?? [],
    stays: graph?.stays ?? [],
    legs: graph?.legs ?? [],
    budget: graph?.budget ?? {
      node_id: "ledger_gate",
      line_items: [],
      totals_by_category: {},
      total: { currency: "INR", amount: 0 },
      vs_stated: {},
    },
    risk: graph?.risk ?? [],
    pretrip: graph?.pretrip ?? [],
    packing: graph?.packing ?? { node_id: "packing_gate", items: [] },
  } as PlanGraph;
}

/**
 * P3.8: deterministic gate — the full P1.8 rule set (seasons, permits,
 * closures, rail windows, altitude, pacing, anti-prefs, budget, festivals)
 * over the real KB (P2.9 adapter). Zero LLM calls.
 */
export function makeConstraintGateNode(kb: ConstraintKb) {
  return async function constraintGateNode(
    state: PipelineState,
  ): Promise<{ criticReports: CriticReport[] }> {
    const report = runRules(
      { graph: normalizeForRules(state.graph), profile: state.profile, kb },
      ALL_RULES,
    );

    if (!report.pass) {
      return {
        criticReports: [
          {
            score: 0.0,
            issues: report.blocking.map((v) => ({
              node_ref: v.node_refs[0] ?? "unknown",
              criterion: `constraint:${v.rule_id}`,
              severity: "blocking" as const,
              suggested_fix: v.machine_fix_hint || v.message,
            })),
          },
        ],
      };
    }

    return { criticReports: [] };
  };
}
