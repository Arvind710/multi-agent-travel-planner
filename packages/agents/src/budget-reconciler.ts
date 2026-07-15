import { z } from "zod";
import { newNodeId } from "@raah/plan-graph";
import { TravellerProfile } from "@raah/shared/profile";
import { PlanGraph, Ledger, LineItem, BudgetCategory } from "@raah/plan-graph";
import { ModelRouter } from "./router";

const SimpleTradeoff = z.object({
  label: z.string(),
  delta_inr: z.number().int(),
});

export const BudgetReconcilerOutputSchema = z.object({
  tradeoffs: z.array(SimpleTradeoff).default([]),
  justification: z.string().optional(),
});

export type BudgetReconcilerOutput = z.infer<typeof BudgetReconcilerOutputSchema>;

export class BudgetReconcilerAgent {
  constructor(private router: ModelRouter) {}

  public async reconcileBudget(profile: TravellerProfile, graph: PlanGraph): Promise<Ledger> {
    // 1. Deterministic Ledger Assembly
    const lineItems: LineItem[] = [];
    let totalInr = 0;
    const totalsByCategory: Partial<Record<BudgetCategory, { currency: string; amount: number }>> =
      {};

    const addLineItem = (
      ref: string,
      category: BudgetCategory,
      label: string,
      amount: number,
      confidence: "estimate" | "quoted" | "booked",
    ) => {
      lineItems.push({
        node_id: newNodeId("line_item"),
        node_ref: ref as any,
        category,
        label,
        amount: { currency: "INR", amount },
        confidence,
      });
      totalInr += amount;
      const bucket = (totalsByCategory[category] ??= { currency: "INR", amount: 0 });
      bucket.amount += amount;
    };

    // Stays
    for (const stay of graph.stays) {
      // Assuming 1 room for simplistic math, or derived from profile.party
      addLineItem(
        stay.node_id,
        "stays",
        stay.primary.name,
        stay.primary.price_per_night.amount,
        "estimate",
      );
    }

    // Legs
    for (const leg of graph.legs) {
      addLineItem(
        leg.node_id,
        "transport",
        `${leg.mode} to ${leg.to_stop_ref}`,
        leg.cost.amount,
        "estimate",
      );
    }

    // Experiences & Meals
    for (const day of graph.days) {
      for (const block of day.blocks) {
        if (block.cost.amount > 0) {
          addLineItem(block.node_id, "experiences", block.title, block.cost.amount, "estimate");
        }
      }
      for (const meal of day.meals) {
        if (meal.cost.amount > 0) {
          addLineItem(meal.node_id, "food", meal.venue, meal.cost.amount, "estimate");
        }
      }
    }

    // 2. LLM Narrative for Tradeoffs
    const promptString = `Given the TravellerProfile:\n${JSON.stringify(profile, null, 2)}\n\nAnd the assembled Budget Totals (INR): ${totalInr}\n\nGenerate 2-3 actionable trade-offs the user could make to adjust the budget, and a justification if the total deviates significantly from their stated budget.`;

    const { data } = await this.router.generateStructured(
      "curation",
      promptString,
      BudgetReconcilerOutputSchema,
      "You are an expert travel budget planner for India.",
    );

    let deltaPct = 0;
    if (profile.budget?.total) {
      const statedTotal = profile.budget.per_person
        ? profile.budget.total * profile.party.adults
        : profile.budget.total;
      deltaPct = ((totalInr - statedTotal) / statedTotal) * 100;
    }

    return {
      node_id: newNodeId("ledger"),
      line_items: lineItems,
      totals_by_category: totalsByCategory as any,
      total: { currency: "INR", amount: totalInr },
      vs_stated: {
        stated: profile.budget?.total
          ? {
              currency: "INR",
              amount: profile.budget.per_person
                ? profile.budget.total * profile.party.adults
                : profile.budget.total,
            }
          : undefined,
        delta_pct: deltaPct,
        justification: data.justification,
      },
      tradeoffs: data.tradeoffs.map((t) => ({
        label: t.label,
        delta: { currency: "INR", amount: t.delta_inr },
      })),
    };
  }
}
