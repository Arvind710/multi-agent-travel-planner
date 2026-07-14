# @raah/constraints

The deterministic rule layer (ARCH §7.3): pure TypeScript validators that run
as `constraint_gate` (filters concepts) and `constraint_regate` (final
validation — a failing plan cannot ship). **Zero LLM calls** — determinism at
the edges, intelligence in the middle (ARCH §0.3); CI-enforced by
dependency-cruiser `no-llm-in-deterministic`.

## API

- `runRules(ctx, rules)` → `RuleReport {violations, blocking, warnings, pass}`
- `ConstraintContext {graph, profile, kb, today?}` — `today` injectable for booking-window math
- `ALL_RULES` — the full rule set below
- `ConstraintKb` — the deterministic KB read interface. `StaticConstraintKb` +
  `testKb()` serve tests until P2.9 swaps in the real India KB adapter
  (same interface, exact lookups only — closures/permits are never vector-fuzzy).

Every violation carries `rule_id`, `severity`, `node_refs`, a human message,
and a `machine_fix_hint` agents act on in the revision loop.

## Rules (P1.8)

| Rule id                    | Severity | Checks                                                                                                                                                         | Data source              |
| -------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `season-window`            | blocking | No stop in a KB-**closed** season window (Ladakh roads in Jan)                                                                                                 | KB climate calendar      |
| `season-caution`           | warning  | Stops in **avoid** windows (monsoon/heat) surfaced with months                                                                                                 | KB climate calendar      |
| `permit-required`          | blocking | Region × nationality permits present as pretrip items (`kind: "permit"`, tag `permit:<id>`); hint includes apply-by date from lead time                        | KB permit matrix         |
| `monument-closure`         | blocking | No block at a monument on its weekly closure day (Taj: Friday) or holiday dates                                                                                | KB monument DB           |
| `park-closure`             | blocking | No park stop/block during closed months (most parks Jul–Sep)                                                                                                   | KB park DB               |
| `rail-booking-window`      | warning  | Train legs: `opens_at = depart − 60d` exact; high waitlist risk ⇒ fallback_ref; pre-window bookings carry urgency guidance                                     | 60-day IRCTC rule (code) |
| `altitude-acclimatization` | blocking | Sleeping-altitude gain ≤ 500 m/day above 3 000 m; first day at a ≥3 000 m stop arriving from below must be `energy: "light"` (Leh rest day)                    | KB altitude table        |
| `max-daily-travel`         | blocking | Per-day travel minutes = max(transit blocks, legs departing that day) ≤ profile cap                                                                            | profile + graph          |
| `pace-energy`              | blocking | No > 2 consecutive `full` days when `taste.pace ≤ 0.4`                                                                                                         | profile + graph          |
| `anti-preference`          | blocking | No node tagged with a profile anti-pref without `tradeoff_flagged`; `early_mornings` also enforced on block start times (< 06:30)                              | profile + graph          |
| `budget-bounds`            | blocking | Ledger total within ±10 % of stated budget (graph `vs_stated` or profile), or an explicit justification exists; cross-currency totals are flagged unverifiable | graph + profile          |
| `date-festival-collision`  | warning  | Festival surge windows (≥1.2×) overlapping a stay, deduped per stop × festival, with surge data                                                                | KB festival calendar     |

(The plan's `season-window` rule is split into `season-window` (blocking) +
`season-caution` (warning) so machine feedback is unambiguous.)

## Testing

Every rule has ≥1 passing and ≥1 failing fixture (`rules.test.ts`), and the
golden fixture graphs must pass `ALL_RULES` with corrupted variants
snapshot-tested (`fixtures-gate.test.ts`). Coverage floors: 95 % lines /
statements / functions, 85 % branches. KB data in `kb.ts` is **test fixture
data** — real, verified values live in `/content/kb` from Phase 2.
