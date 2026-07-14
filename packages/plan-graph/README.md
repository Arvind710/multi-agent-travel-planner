# @raah/plan-graph

The canonical PlanGraph domain model (ARCH §5): typed Zod schemas, the pure
mutation engine (`applyPatch`), structural diffing (`diff` / `summarizeDiff` /
`diffToPatches`), and targeted invalidation (`invalidate` → `DirtySet`).

**Deterministic package:** zero LLM calls, zero network (CI-enforced via
dependency-cruiser `no-llm-in-deterministic`). Pure functions only.

## Public API

| Export                                                                                                                                                                                                                      | Purpose                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `PlanGraph`, `Stop`, `Day`, `Block`, `MealSlot`, `StayAssignment`, `TransitLeg`, `Ledger`, `LineItem`, `FragileLeg`, `TimelineItem`, `PackingList`, `Concept`, `Reasoning`, `SourceRef`, `LockState`, `Money`-bearing types | Zod schemas + inferred TS types — the repo-wide canonical types                                                               |
| `newNodeId(kind)`, `kindOf`, `isNodeId`, `nodeIdOf(kind)`                                                                                                                                                                   | Stable `{kind}_{ulid}` node-ID scheme                                                                                         |
| `applyPatch(graph, patch, {actor, ownership?})`                                                                                                                                                                             | Pure mutation: clone → apply ops → schema re-validate → invariant check → `Result`                                            |
| `GraphPatchOp` (`add_node`, `update_node`, `remove_node`, `move_node`, `set_lock`)                                                                                                                                          | The only ways to mutate a graph                                                                                               |
| `diff(a, b)` / `summarizeDiff` / `diffToPatches`                                                                                                                                                                            | Node-level diff, DiffBanner hunks, and diff→patch round-trip (`applyPatch(a, diffToPatches(diff(a,b))) ≡ b`, property-tested) |
| `invalidate(graph, nodeIds \| intent)`                                                                                                                                                                                      | DirtySet computation for targeted revision (ARCH §5.4)                                                                        |
| `checkInvariants(graph, {strict?})`                                                                                                                                                                                         | Invariant validation (used internally by `applyPatch`; `strict` for final gates)                                              |
| `indexNodes(graph)`                                                                                                                                                                                                         | Uniform addressable view over the nested document                                                                             |
| `src/testing/{builders,fixtures}`                                                                                                                                                                                           | Test/fixture builders (not part of the runtime API)                                                                           |

## Invariants

Enforced by `applyPatch` before any patch lands (structural tier), plus a
strict tier for validated/shipped graphs:

| Invariant           | Tier       | Rule                                                                                                                         |
| ------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `unique-node-ids`   | structural | Every node id (incl. embedded block alternatives) appears exactly once                                                       |
| `route-chronology`  | structural | Per stop `arrive ≤ depart`; consecutive stops chain with `depart ≤ next.arrive ≤ depart + 1 day` (overnight transit allowed) |
| `stop-nights-math`  | structural | `nights == daysBetween(arrive, depart)`                                                                                      |
| `day-date-aligned`  | structural | A day's date lies in `[previous stop's depart, its stop's depart]` (transit days belong to the arriving stop)                |
| `days-contiguous`   | structural | Day dates are unique and consecutive                                                                                         |
| `legs-adjacency`    | structural | Legs connect **adjacent** stops in route order; `depart_date` within the transfer window                                     |
| `refs-exist`        | structural | `day.stop_ref`, `stay.stop_ref`, `leg.fallback_ref`, `risk.target_ref`, `plan_b.node_refs`, `pretrip.refs` all resolve       |
| `one-stay-per-stop` | structural | At most one StayAssignment per stop                                                                                          |
| `line-item-refs`    | structural | Budget line items reference existing nodes                                                                                   |
| `alternatives-kind` | structural | Block alternatives share the primary's `kind`                                                                                |
| `days-cover-route`  | strict     | Days cover `route[0].arrive → route[last].depart` exactly                                                                    |
| `stay-per-stop`     | strict     | Every stop with nights > 0 has a stay assignment                                                                             |

Lock rail: nodes with `locks: "user"` are immutable to any actor except
`"user"` (incl. adding into a locked day). Only `"user"` may `set_lock`.
Ownership rail: `applyPatch` with `ownership: NodeKind[]` rejects ops on any
other kind — agents physically cannot patch outside their ownership (ARCH §7.2).

## DirtySet propagation rules (`invalidate`)

| Changed                          | Dirties                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| stop                             | its days (+ their blocks/meals), its stay, legs touching it, budget, risk, pretrip, packing |
| day                              | its blocks + meals, budget                                                                  |
| block                            | its parent day (energy re-check), budget                                                    |
| meal / stay / line_item / ledger | budget                                                                                      |
| leg                              | budget, risk, pretrip                                                                       |
| concept                          | everything (a concept change is a re-plan)                                                  |
| risk / pretrip / packing         | own section                                                                                 |
| `{kind:"date_shift"}` intent     | everything date-dependent: all days/blocks/meals/legs/stays + all sections                  |

Monotonicity (`invalidate(A ∪ B) ⊇ invalidate(A) ∪ invalidate(B)`) is
property-tested.

## Fixtures

`fixtures/golden-rajasthan-14d.json` and `fixtures/golden-kerala-7d.json` are
deterministic (seeded ULIDs), regenerated via `pnpm fixtures:generate`; a test
fails if the JSON drifts from the generators. They are used repo-wide in later
phases' tests.

## Testing

`pnpm test` runs with V8 coverage; floors (CI-enforced): 95% lines/statements,
95% functions, 85% branches. Property tests read `FC_NUM_RUNS`
(default 100 locally; CI: 1k on PR, 10k nightly).
