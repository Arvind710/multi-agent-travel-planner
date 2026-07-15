# Raah — Project Status & Resume Plan

**Written:** 2026-07-15, on pausing the project.
**Purpose:** Snapshot of what is complete, what is v0, and the ordered plan of action for when work resumes. Companion to `implementation-plan.md` (the execution contract), `architecture.md`, and `problemstatement.md`.

**TL;DR:** P0–P2 are genuinely complete. P3–P8 all have code landed, but as audited "v0" slices — breadth without the exit gates. The repo is healthy (typecheck + tests green across all 13 packages, clean tree at commit `e51aff9`), and the single most urgent piece of work is closing the P3 exit gate, starting with LLM request pacing, because live runs currently die mid-pipeline on the Gemini free-tier's 20-request window.

---

## Completed (exit gates green)

- **P0 Foundations** — monorepo, Docker dev stack, CI quality gates (dep-cruiser, Lighthouse, axe), Auth.js, SSE infra, OTel/Sentry, feature flags.
- **P1 PlanGraph + Constraints** — full Zod schemas, mutation engine with ownership rails, diff/invalidate, 95% coverage with property tests, versioned persistence, 12 deterministic rules with passing + failing fixtures.
- **P2 India KB v1 (core)** — 11 entity kinds with freshness metadata, `kb:validate` in CI, ingest worker, deterministic retrieval, constraints wired to the real KB (P2.9 done). Only 29 entities exist vs. the ~80-entity Rajasthan-deep target, but the plan explicitly makes circuit depth non-blocking founder work (P2.4/P2.5/P2.10).

## Built as v0 — gates NOT closed

- **P3 Agent runtime** — all 12 agents exist in a LangGraph pipeline; the worker's `plan.generate` runs it end-to-end with SSE and saves real PlanGraphs; the Ladakh-in-January rejection works in mocked-LLM tests. Missing: Postgres checkpointing + token ledger + **request pacing** (P3.1), versioned prompt files (P3.3), `packages/agents/src/tools.ts` is still stubs instead of calling `packages/integrations` (P3.4), cassette tests (P3.5/3.6).
- **P3.10 Web intake** — PromptCanvas / UnderstandingEcho / ClarifierCard / AgentProgressRail all exist but run on mocked flows (`/plan/new` pushes to `trip/mock-trip-123`); never wired to the real tRPC routes + SSE stream that already exist on the backend.
- **P3.12 / P5.8 Evals** — judge harness, critic planted-defect tests, and grounding tests exist, but briefs are literally London/New York placeholders (`evals/src/index.ts`) and nothing is wired into CI.
- **P4/P5** — domain agents, critic, and narrator exist v0; itinerary document UI exists but only as a `/dev/itinerary` preview; no 60-brief eval set, no grounding audit, no judge calibration.
- **P6** — edit-intent and profile-learning agents plus DiffBanner / VersionHistory / SwapSheet components exist; the `plan.revise` queue is declared in `apps/worker/src/queues.ts` but **has no worker job**; export/share/print partially real; both e2e specs (`apps/web/tests/e2e/`) are thin scaffolds.
- **P7** — maps/weather/AQI/FX adapters exist but call live APIs directly, bypassing the P0.10 provider-mock server (noted reconciliation debt in commit `4848dc0`); rail/hotels/flights deep-link adapters don't exist yet.
- **P8** — groundwork only (Semgrep workflow, incident runbooks, k6 load script).

## Known live-run facts (from 2026-07-15 runs, commit `e51aff9`)

- Fresh free-tier Gemini keys: `gemini-2.5-pro` has zero free quota, `gemini-2.5-flash` 404s — only the `-latest` aliases work.
- A live run reached architect → gate → route → logistics, then exhausted the free tier's **20-request window** during the curator fan-out. Request pacing/budget (P3.1) is the hard blocker for any live demo.
- LLM-facing Zod schemas must survive JSON-Schema conversion (no `z.custom`); a regression test now converts every LLM-facing schema.

## Repo health at pause

- Typecheck + tests: 26/26 turbo tasks green, all 13 packages.
- Lint: 0 errors; 151 `no-explicit-any` warnings = tracked debt, scoped in `eslint.config.mjs`.
- Working tree clean at `e51aff9`.

---

## Plan of action (on resume)

The implementation plan's own rule is "don't start a phase until the previous gate is green," and the repo has run ahead of that. The work now is **closing gates in order, not adding breadth**.

### Step 1 — Make live runs survivable (P3.1, the blocker)
Request pacer in the ModelRouter (serialize the curator fan-out, respect RPM windows, flash-lite tiering for cheap calls), per-job TokenLedger with hard budget and a graceful-degradation event, Postgres checkpointing with a kill-and-resume test. Without this, nothing downstream can be demonstrated live.

### Step 2 — Kill the P3 stubs
Wire `tools.ts` to the real `packages/integrations` adapters and route dev traffic through the provider-mock server (this also retires the P7 reconciliation debt early); add mock-backed rail/hotels/flights adapters; move prompts into versioned files with the loader (P3.3).

### Step 3 — Wire the web UI to the real backend (P3.10/3.11)
Replace `mock-trip-123` with the real `intake.parsePrompt → clarifiers → plan.generate` flow, AgentProgressRail consuming real SSE, skeleton plan rendering from streamed patches. This is the "first wow" the phase exists for.

### Step 4 — Make the evals real (P3.12) and run the P3 exit gate
20 India golden briefs replacing the London/NY placeholders, CI wiring for `packages/agents` PRs, cassette tests for profiler/clarifiers. Then formally check every P3 gate item: Playwright golden flow under 60s on mocks, Ladakh-January rejection visible in the UI, "surprise me" → 3 concepts, worker-kill resume, token-budget degradation.

### Step 5 — P4 gate
Grow evals to 60 briefs across personas × regions × seasons, grounding-audit script (50 sampled nodes → 100% SourceRef or verify_flag), anti-preference verification, p95 < 60s on mocks.

### Step 6 — P5 gate
Planted-defect test to pick the critic model, wire the itinerary document to real generated plans (currently preview-only), judge calibration against human ratings, internal demo with 5 scripted briefs.

### Step 7 — P6 gate
Implement the missing `plan.revise` worker job (intent → DirtySet → scoped re-run → diff), then the accept/revert/rollback flows, and flesh out the two e2e scaffolds.

### Parallel track throughout
KB authoring via the existing `kb:draft` CLI — 3–4 verified entities per evening toward Rajasthan/Kerala depth. Per the plan, this is founder time, never a phase gate.

### Standing constraints (user-stated, not defaults)
- **$0 budget.** Free-tier-first LLM routing (ADR-013): Gemini free tier for generators — requests/day is the budget, not dollars. Critic = OpenAI gpt-5-mini within the existing $5 credit (ADR-014); evals use the free critic. Any new dependency/service must have a $0 tier.
- Pan-India coverage from day one via constraint datasets; curated circuits are a quality tier, demand-driven.
- Hosting: local until P7; then Railway free month → Oracle Cloud Always Free.
- One commit per task ID (`P3.4: …`); every bug found becomes an eval brief or constraint fixture before the fix merges.
