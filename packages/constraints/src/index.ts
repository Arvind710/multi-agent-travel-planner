/**
 * @raah/constraints — deterministic rule layer (ARCH §7.3).
 * Season windows, permits, closures, rail booking-window math, altitude
 * acclimatization, pacing, budget arithmetic. Pure TypeScript, ZERO LLM calls
 * (CI-enforced). Runs as `constraint_gate` and `constraint_regate`.
 */
export * from "./engine";
export * from "./kb";
export * from "./rules";
