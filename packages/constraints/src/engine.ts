import type { NodeId, PlanGraph } from "@raah/plan-graph";
import type { TravellerProfile } from "@raah/shared/profile";
import type { ISODate } from "@raah/shared/dates";
import type { ConstraintKb } from "./kb";

/**
 * Deterministic rule engine (P1.7, ARCH §7.3). Pure TypeScript, zero LLM.
 * Runs as `constraint_gate` (filters concepts) and `constraint_regate`
 * (final validation — a failing plan cannot ship).
 */

export type RuleSeverity = "blocking" | "warning";

export interface Violation {
  rule_id: string;
  severity: RuleSeverity;
  node_refs: NodeId[];
  message: string;
  /** Machine-readable feedback agents can act on in the revision loop. */
  machine_fix_hint?: string;
  /** Structured payload (e.g. surge data) for UI / agent consumption. */
  data?: Record<string, unknown>;
}

export interface ConstraintContext {
  graph: PlanGraph;
  profile: TravellerProfile;
  kb: ConstraintKb;
  /** "Today" for booking-window math — injectable for tests (defaults istToday()). */
  today?: ISODate;
}

/** What a rule emits; the engine stamps rule_id + severity. */
export type RuleFinding = Omit<Violation, "rule_id" | "severity">;

export interface Rule {
  id: string;
  severity: RuleSeverity;
  description: string;
  check(ctx: ConstraintContext): RuleFinding[];
}

export interface RuleReport {
  violations: Violation[];
  blocking: Violation[];
  warnings: Violation[];
  /** True when zero blocking violations (warnings don't fail a plan). */
  pass: boolean;
}

export function runRules(ctx: ConstraintContext, rules: readonly Rule[]): RuleReport {
  const violations = rules.flatMap((rule) =>
    rule.check(ctx).map((finding): Violation => ({
      rule_id: rule.id,
      severity: rule.severity,
      ...finding,
    })),
  );
  const blocking = violations.filter((v) => v.severity === "blocking");
  const warnings = violations.filter((v) => v.severity === "warning");
  return { violations, blocking, warnings, pass: blocking.length === 0 };
}
