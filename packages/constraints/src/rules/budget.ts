import { statedBudget } from "@raah/shared/profile";
import type { Rule, RuleFinding } from "../engine";

/** Allowed deviation before a justification is mandatory (PS §15.8). */
export const BUDGET_TOLERANCE = 0.1;

/**
 * budget-bounds (blocking): ledger total within ±10% of the stated budget,
 * or the deviation carries an explicit justification.
 */
export const budgetBoundsRule: Rule = {
  id: "budget-bounds",
  severity: "blocking",
  description: "Budget total within ±10% of stated, or explicitly justified",
  check: ({ graph, profile }) => {
    const stated = graph.budget.vs_stated.stated ?? statedBudget(profile.budget) ?? undefined;
    if (!stated || stated.amount <= 0) return [];
    const total = graph.budget.total;
    if (total.currency !== stated.currency) {
      return [
        {
          node_refs: [graph.budget.node_id],
          message: `Cannot verify budget: ledger is in ${total.currency}, stated budget in ${stated.currency}`,
          machine_fix_hint: "Reconcile the ledger into the stated currency via fx.rate",
        },
      ];
    }
    const deltaPct = (total.amount - stated.amount) / stated.amount;
    if (Math.abs(deltaPct) <= BUDGET_TOLERANCE) return [];
    if (graph.budget.vs_stated.justification) return [];
    const findings: RuleFinding[] = [
      {
        node_refs: [graph.budget.node_id],
        message: `Plan totals ${total.amount} ${total.currency} vs stated ${stated.amount} — ${(deltaPct * 100).toFixed(0)}% off with no justification`,
        machine_fix_hint:
          deltaPct > 0
            ? "Cut cost (cheaper stays/classes) or set vs_stated.justification explaining the overage"
            : "Upgrade experiences/stays toward the budget or justify the underspend",
        data: { delta_pct: deltaPct, stated: stated.amount, total: total.amount },
      },
    ];
    return findings;
  },
};
