import type { Rule } from "../engine";
import { altitudeAcclimatizationRule } from "./altitude";
import { budgetBoundsRule } from "./budget";
import { monumentClosureRule } from "./monuments";
import { permitRequiredRule } from "./permits";
import {
  festivalCollisionRule,
  parkClosureRule,
  seasonCautionRule,
  seasonWindowRule,
} from "./season";
import { antiPreferenceRule, paceEnergyRule } from "./taste";
import { maxDailyTravelRule, railBookingWindowRule } from "./transit";

export * from "./altitude";
export * from "./budget";
export * from "./monuments";
export * from "./permits";
export * from "./season";
export * from "./taste";
export * from "./transit";

/** The full deterministic rule set (P1.8). */
export const ALL_RULES: readonly Rule[] = [
  seasonWindowRule,
  seasonCautionRule,
  permitRequiredRule,
  monumentClosureRule,
  parkClosureRule,
  railBookingWindowRule,
  altitudeAcclimatizationRule,
  maxDailyTravelRule,
  paceEnergyRule,
  antiPreferenceRule,
  budgetBoundsRule,
  festivalCollisionRule,
];
