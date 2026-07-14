# Implementation Plan: AI-Powered Multi-Agent Travel Planner for India

**Derived from:** `problemstatement.md` v1.0 (PS) and `architecture.md` v1.0 (ARCH)
**Version:** 1.0 — July 2026
**Audience:** AI build agents (Antigravity). This document is the execution contract. Where this plan, ARCH, and PS conflict: **PS defines WHAT, ARCH defines HOW, this plan defines WHEN and IN WHAT ORDER.** Raise a flag rather than improvise.

---

## 0. How to Execute This Plan (read first, applies to every phase)

### 0.1 Global rules — never violated

1. **Do not start a phase until the previous phase's Exit Gate is fully green.** No parallel phase-skipping. Tasks *within* a phase may run in parallel only where the dependency column allows.
2. **Every task ID (e.g., P3.4) must map to at least one commit referencing it.** Commit format: `P3.4: <imperative summary>`.
3. **No task is done without its listed tests.** "Works when I ran it" is not done. Definition of Done (DoD) for every task: code + tests passing in CI + typecheck clean + lint clean + boundaries check clean (dependency-cruiser) + docs updated if the task says so.
4. **Never put LLM calls in `packages/constraints`, `packages/plan-graph`, or `packages/db`.** These are deterministic-only packages (ARCH §0.3, §7.3). CI enforces via dependency-cruiser rule `no-llm-in-deterministic`.
5. **Never let an agent write outside its ownership** (ARCH §7.2). The mutation engine enforces this; do not add bypasses, even for tests — tests use the engine.
6. **All external data flows through `packages/integrations` adapters.** No direct `fetch()` to providers anywhere else. CI rule: `no-fetch-outside-integrations`.
7. **All dates/times via `packages/shared/dates` (Luxon, IST-aware).** Never `new Date()` arithmetic in domain code.
8. **All user-visible strings through `next-intl` keys** from the first component onward. No hardcoded English in JSX.
9. **Schema-first:** every API route, agent I/O, and LLM structured output has a Zod schema defined *before* implementation. The schema file is the first commit of any such task.
10. **When blocked or ambiguous:** create `docs/decisions/ADR-XXX.md` proposing a resolution consistent with ARCH principles, mark the task `BLOCKED(ADR-XXX)`, continue with unblocked tasks. Do not guess silently.

### 0.2 Repository conventions

- Monorepo layout exactly as ARCH §2 (`/apps/web`, `/apps/api`, `/apps/worker`, `/packages/*`, `/content/kb`, `/infra`, `/evals`).
- Tooling: pnpm 9 + Turborepo; TS 5.x `strict: true`, `noUncheckedIndexedAccess: true`; ESLint (typescript-eslint strict) + Prettier; Vitest for unit/integration; Playwright for E2E; fast-check for property tests.
- Env config: single `packages/shared/env.ts` (Zod-validated `process.env`); `.env.example` kept current; secrets never committed.
- Every package ships `README.md` (purpose, public API, invariants) — updated when public API changes.

### 0.3 Testing floors (CI-enforced)

| Package | Floor |
|---|---|
| `plan-graph` | 95% line coverage + property tests green |
| `constraints` | 95% + every rule has ≥1 passing and ≥1 failing fixture |
| `agents` | Contract tests per agent + cassette determinism |
| `integrations` | Adapter tests vs mocks; nightly live smoke separate |
| `apps/*` | Golden-flow E2E (grows per phase) + axe + Lighthouse budgets (ARCH §3.4) |

### 0.4 Phase map & dependencies

```
P0 Foundations ─► P1 PlanGraph+Constraints ─► P2 India KB v1 ─► P3 Agent Runtime+Intake
      ─► P4 Domain Agents ─► P5 Critic+Narrator+Magic Loop UI ─► P6 Refine+Export+Share
      ─► P7 Live Providers+Accounts ─► P8 Hardening+Launch
```

Estimated shape: P0–P2 are infrastructure-heavy, P3–P5 are the product core, P6–P8 make it shippable. Ship an internal demo at end of P5; private beta at end of P7; public launch after P8.

---

## PHASE 0 — Foundations

**Objective:** A running monorepo where `pnpm dev` boots web+api+worker+Postgres+Redis+provider-mocks locally, CI enforces all quality gates, auth works, and the design system's core exists.
**References:** ARCH §2, §3.1, §4.1, §8.1, §11, §13.

| ID | Task | Depends |
|---|---|---|
| P0.1 | Scaffold Turborepo: all apps/packages per ARCH §2 layout with placeholder exports; pnpm workspaces; turbo pipeline (`build`, `test`, `lint`, `typecheck`) | — |
| P0.2 | Tooling baseline: TS strict configs (shared `tsconfig.base.json`), ESLint+Prettier, Vitest, dependency-cruiser with rules `no-llm-in-deterministic`, `no-fetch-outside-integrations`, `no-cross-app-imports` | P0.1 |
| P0.3 | `docker-compose.dev.yml`: Postgres 16 (+pgvector image), Redis 7, provider-mock server container (P0.10), MinIO (S3). One command: `pnpm dev` | P0.1 |
| P0.4 | `packages/shared`: `env.ts` (Zod), `dates` (Luxon IST helpers: `istNow()`, `dateRange()`, `overlaps()`), `money` (INR + FX types, lakh/crore formatting), `result.ts` (typed Result/AppError taxonomy) | P0.2 |
| P0.5 | `packages/db`: Drizzle schema for ALL tables in ARCH §8.1 (users, traveller_profiles, trips, trip_members, plan_graphs, jobs, clarifier_log, edits_log, kb_entities, provider_cache, price_watches, share_links, audit_log); migration scripts; seed script; testcontainers harness | P0.3, P0.4 |
| P0.6 | `apps/api`: tRPC server skeleton + context (session, db, logger) + health route; OpenAPI generation wired for `/v1` (empty) | P0.5 |
| P0.7 | `apps/worker`: BullMQ bootstrap, queue definitions for all 6 queues (ARCH §6.2), graceful shutdown, per-queue concurrency config from env; a no-op `plan.generate` job that emits SSE heartbeats | P0.5 |
| P0.8 | SSE infrastructure: `GET /api/jobs/:id/events` with `Last-Event-ID` resume, Redis pub/sub bridge worker→api, typed event schemas (ARCH §6.3) in `packages/shared/events.ts` | P0.6, P0.7 |
| P0.9 | Auth: Auth.js v5 with Google OAuth + email magic link (Resend free tier); anonymous-session support (1 free plan, ARCH §11); `trip_members` role middleware for tRPC. Phone OTP is scale-phase — do NOT build | P0.6 |
| P0.10 | Provider mock server (`tools/provider-mocks`): deterministic fixtures for maps distance-matrix/places, rail schedules, hotel search, flights, weather normals, AQI, FX. Fixture files under `tools/provider-mocks/fixtures`. Contract: same response shapes the real adapters will normalize | P0.1 |
| P0.11 | `packages/ui` foundations: design tokens as CSS variables per ARCH §4.1 (color incl. dark theme, type scale with Fraunces/Inter/JetBrains Mono + Noto Indic fallbacks, spacing, motion durations); Tailwind 4 config consuming tokens; shadcn/ui installed; Storybook (or Ladle) running | P0.2 |
| P0.12 | `apps/web`: Next.js 15 App Router skeleton with route map stubs (ARCH §3.1), next-intl wired (en + hi locale files), root layout with theme + font loading, PWA manifest stub | P0.11 |
| P0.13 | CI (GitHub Actions free tier): typecheck/lint/test/boundaries/axe/Lighthouse on PR; docker build; prod deploy = Vercel (web) + VPS/Railway deploy script (api+worker) per ARCH §13.0; Vercel preview deployments serve as staging; migration gate (expand-contract check) | P0.2–P0.12 |
| P0.14 | Observability bootstrap: OTel SDK in api+worker with trace propagation through BullMQ jobs; Sentry client+server; structured logger (pino) with trace-id correlation | P0.6, P0.7 |
| P0.15 | Typed config-file feature flags in `packages/shared/flags.ts` (env-overridable, Zod-validated). No flag service — the typed object IS the seam (ARCH ADR-011 era decision) | P0.2 |

**Exit Gate P0 (all must be true):**
- [ ] `pnpm dev` boots the full stack; `/health` green on api; a dummy `plan.generate` job streams heartbeat SSE events visible in a test page.
- [ ] Sign-in works with email OTP and Google in dev; anonymous session issues and persists.
- [ ] All migrations apply cleanly to a fresh DB; seed script runs.
- [ ] CI green on all gates including dependency-cruiser rules and Lighthouse budget on the stub landing page.
- [ ] Storybook shows tokens: full palette (light+dark), type ramp incl. Devanagari sample, spacing scale.

---

## PHASE 1 — PlanGraph Engine + Constraints

**Objective:** The canonical domain model and the deterministic rule layer, tested to the highest standard in the repo. Everything later depends on these being correct.
**References:** ARCH §5 (entire), §7.3; PS §5.2, §15.

| ID | Task | Depends |
|---|---|---|
| P1.1 | `packages/plan-graph/schema.ts`: complete Zod schemas for PlanGraph per ARCH §5.1 — PlanGraph, Concept, Stop, Day, Block, MealSlot, StayAssignment, TransitLeg, Ledger, FragileLeg, TimelineItem, PackingList, Reasoning, SourceRef, Money, LockState. Stable node-ID scheme: `{kind}_{ulid}`. Export inferred TS types as the repo-wide canonical types | — |
| P1.2 | Mutation engine: `applyPatch(graph, patch)` with patch ops `add_node`, `update_node`, `remove_node`, `move_node`, `set_lock`; invariant checks pre-commit (days contiguous & date-aligned to route; legs connect adjacent stops; budget line items reference existing nodes; locked nodes immutable to non-user actors; alternatives share the same kind as primary) | P1.1 |
| P1.3 | `diff(a, b) → PlanDiff` (node-level: added/removed/changed with field paths) and `summarizeDiff` (human-readable hunks for the DiffBanner) | P1.2 |
| P1.4 | `invalidate(graph, nodeIds | intent) → DirtySet`: dependency propagation rules (stop change dirties its days/blocks/stay/adjacent legs + budget + risk + pretrip; date shift dirties everything date-dependent; block swap dirties day energy + budget). Rules table documented in package README | P1.2 |
| P1.5 | Property-based tests (fast-check): apply/diff round-trip (`applyPatch(a, diffToPatches(diff(a,b))) ≡ b`), invariants never violated by generated patch sequences, DirtySet monotonicity, ID stability across versions. Plus fixture graphs: `golden-rajasthan-14d.json`, `golden-kerala-7d.json` used repo-wide in later tests | P1.2–P1.4 |
| P1.6 | Graph persistence: `plan_graphs` repo functions (save version with parent+diff, load version, list versions, rollback = new version copying old graph); schema-validate on every write | P1.1, P0.5 |
| P1.7 | `packages/constraints`: rule engine skeleton — `Rule {id, severity: blocking|warning, check(graph, profile, kb): Violation[]}` with structured `Violation {rule_id, node_refs, message, machine_fix_hint}` | P1.1 |
| P1.8 | Implement deterministic rules (each with passing+failing fixtures): `season-window` (region×month matrix), `permit-required` (region×nationality), `monument-closure` (weekday/holiday calendar), `park-closure` (seasonal), `rail-booking-window` (60-day + tatkal math), `altitude-acclimatization` (no sleep-altitude gain >500m/day above 3000m; Leh arrival rest day), `max-daily-travel` (vs profile), `pace-energy` (no >2 consecutive "full" days when pace ≤0.4), `anti-preference` (graph must not contain nodes tagged with profile anti-prefs without an explicit flagged trade-off), `budget-bounds` (±10% or justified), `date-festival-collision` (warning w/ surge data). Rule data read from KB interfaces (mocked until P2) | P1.7 |
| P1.9 | `TravellerProfile` schema in `packages/shared/profile.ts` per PS §4.4 incl. provenance map; profile versioning + delta application (`applyProfileDelta`) | — |

**Exit Gate P1:**
- [ ] Coverage ≥95% on both packages; all property tests green (10k runs in CI nightly, 1k on PR).
- [ ] Golden fixture graphs validate against schema and pass all constraint rules; deliberately corrupted variants fail the expected rules with the expected violation payloads (snapshot-tested).
- [ ] `plan_graphs` versioning round-trips: save v1 → patch → save v2 → diff(v1,v2) matches stored diff → rollback creates v3 ≡ v1.
- [ ] Package READMEs document every invariant and every rule with its data source.

---

## PHASE 2 — India Knowledge Base v1

**Objective:** The owned data moat: schema'd content, ingestion, hybrid retrieval, freshness machinery. Coverage: **Rajasthan + Kerala circuits deep**, plus the cross-cutting datasets all rules need.
**References:** ARCH §9; PS §5.3.

| ID | Task | Depends |
|---|---|---|
| P2.1 | `packages/kb/schemas`: Zod schemas per entity kind — region, monument, park, festival, permit, rail-route, food-atlas, craft-cluster, safety-note, road-realism, climate-calendar. Mandatory meta: `last_verified, verified_by, expires_at, sources[]`. JSON-Schema exported for content-repo validation | — |
| P2.2 | Content validation CLI: `pnpm kb:validate` — validates `/content/kb/**` against schemas, checks cross-references (a monument's region exists), checks expiry dates, fails CI on error | P2.1 |
| P2.3 | Author cross-cutting datasets (these feed `constraints` directly): climate-calendar for ALL regions (month×region matrix), festival calendar 2026–2028 (national + major regional with `surge_factor`, `impact_radius_km`), permit matrix (all restricted regions × nationality classes), road-realism table (terrain → effective km/h), altitude table (major destinations → sleeping altitude) | P2.1 |
| P2.4 | Author Rajasthan circuit deep: region file, ≥12 monuments (incl. closure days, fees dom/intl, dress, best-time), Ranthambore park, ≥8 food-atlas entries, ≥3 craft clusters (Bagru, Kutch-adjacent note out of scope, Jaipur blue pottery…), safety notes for Jaipur/Udaipur/Jodhpur/Jaisalmer, rail-route entries for the main sectors | P2.1 |
| P2.5 | Author Kerala circuit deep: same completeness bar — backwaters, Munnar, Fort Kochi monuments, Periyar, Sadya/toddy-shop food atlas, Theyyam/Kathakali performance entries, monsoon nuance (SW vs NE monsoon impact) | P2.1 |
| P2.6 | Ingestion job `kb.ingest`: on merge → validate → upsert `kb_entities` → chunk + embed (pgvector) → bump KB version key (busts Redis retrieval cache). Idempotent, reports diff of changed entities | P2.2, P0.7 |
| P2.7 | Retrieval API (`packages/kb`): `lookup(kind, slug)` and structured queries (deterministic reads — closures, permits NEVER via vector search); `search(query, filters)` hybrid semantic for curation; both return entities with meta so callers can propagate `SourceRef` | P2.6 |
| P2.8 | Freshness machinery: expired entities flagged in retrieval results (`stale: true`); weekly verification-queue report job; KB coverage dashboard query (per-circuit completeness %, fresh %) exposed on an internal admin route | P2.6 |
| P2.9 | Wire `constraints` rules to real KB interfaces (replace P1.8 mocks); re-run full constraint fixture suite against real data | P2.3–P2.7, P1.8 |
| P2.10 | **Solo KB authoring workflow (build the tooling, then use it for P2.3–P2.5):** `pnpm kb:draft <kind> <name>` — a CLI that (1) prompts an LLM with the entity's Zod schema + a research instruction to draft the YAML **with a source URL per factual field**, (2) writes it to `/content/kb/drafts/`, (3) opens a review checklist: founder verifies each sourced field against the official site (5–10 min/entity), fixes, sets `last_verified: <today>` + `expires_at` (fees/hours: +6mo; permits: +3mo; climate: +2yr), moves to the live folder, commits. **Nothing leaves `/drafts` without human verification — this rule is absolute.** Taste entities (food atlas, crafts, insider notes) follow the same flow but the "verification" is founder judgment + ≥2 corroborating sources (longform travel writing, local blogs, personal knowledge); LLM drafts are candidates, never truth | P2.1, P2.2 |

**Authoring throughput math (for planning honesty):** hard-fact entity ≈ 15 min with the CLI (draft is instant; verification is the work). Taste entity ≈ 20–30 min. Rajasthan deep (≈80 entities) ≈ 25–30 hours of founder time — spread over the weeks that P3–P4 code is being built, this is 3–4 entities per evening. It is the single best use of non-coding time in the project.

**Exit Gate P2:**
- [ ] `pnpm kb:validate` green over all authored content; CI blocks invalid content merges.
- [ ] Retrieval: deterministic lookups return correct closure/permit/season data for 20 spot-check queries (fixture-asserted); semantic search returns relevant curation entities for 10 taste queries (snapshot-reviewed).
- [ ] Constraint suite green against live KB; `season-window` correctly fails a "Ladakh road trip in January" fixture and passes "Ladakh in July".
- [ ] Cross-cutting pan-India datasets (P2.3) 100% complete — these gate the phase. Showcase-circuit curation (P2.4/P2.5) is NON-blocking: it proceeds in parallel with P3–P5 at whatever pace founder time allows; the coverage dashboard tracks it but never gates a phase.

---

## PHASE 3 — Agent Runtime + Intake (Profiler, Concept, Constraint Gate)

**Objective:** The agentic skeleton end-to-end: NL prompt → profile → clarifiers → concept(s) → constraint-filtered route skeleton, streamed to a real UI, on mocked providers. First "wow" moment, minus the depth.
**References:** ARCH §7 (entire), §6.2–6.3; PS §4 (entire), §5.1–5.2.

| ID | Task | Depends |
|---|---|---|
| P3.1 | `packages/agents/runtime`: `AgentRuntime` wrapper over LangGraph — typed `PipelineState` (ARCH §7.1), Postgres checkpointing per node, per-job `TokenLedger` with hard budget (env: `PLAN_TOKEN_BUDGET`), resumability test (kill mid-run → resume completes) | P1, P0.7 |
| P3.2 | `ModelRouter` (`packages/agents/router.ts`): policy table {task_class → provider/model/params} from flags; fallback provider on error/timeout; every call logs to Langfuse with `(prompt_id, prompt_version, model, tokens, cost, latency)`; structured-output helper = Zod schema → JSON mode → validate → single auto-retry on failure → typed error | P3.1, P0.15 |
| P3.3 | Prompt infrastructure: `packages/agents/prompts/` — template files with typed slot interfaces, `prompt_id@version` headers, loader that refuses unversioned prompts. Untrusted-content framing helper (ARCH §12 prompt-injection defense) mandatory for any user/external text interpolation | P3.2 |
| P3.4 | Tool layer: `ToolDef` registry per ARCH §7.2 — `kb.lookup`, `kb.search`, `maps.distanceMatrix`, `maps.places`, `rail.schedule`, `hotels.search`, `flights.search`, `weather.normals`, `fx.rate` — all hitting `packages/integrations` adapters (which hit mocks until P7). Post-processor: any graph node whose factual fields lack a `SourceRef` from a tool call gets `verify_flag=true` mechanically | P3.1, P0.10 |
| P3.5 | **Profiler agent — NL parse:** prompt → `TravellerProfile` with per-field confidence + provenance `nl_parse`. Cassette tests over ≥15 real-style briefs (the 5 from PS §4.1 + edge cases: Hinglish input, wedding anchor, "surprise me", vague dates, contradictory brief) asserting extracted fields | P3.2, P1.9 |
| P3.6 | **Profiler — clarifier engine:** candidate generation (low-confidence high-impact fields + KB contingency triggers per ARCH §7.7), scoring `information_value × plan_impact` via small model against rubric prompt, select top 3–8, each with quick-tap options + "because" line. Emits `ClarifierSpec`; answers apply profile deltas with provenance `clarifying_qN`. Tests: December+mountains brief MUST surface altitude/closure question; Diwali dates MUST surface surge question; complete brief asks ≤3 | P3.5, P2.7 |
| P3.7 | **Concept Architect:** profile → 1 concept (clear brief) or 2–3 contrasting concepts (open brief, PS §4.1 inspiration mode) — each `{title, narrative, region_strategy, route_skeleton, discarded_alternatives[]}`. Grounded in KB region/climate data via tools | P3.4, P3.5 |
| P3.8 | **Constraint Gate node:** run `packages/constraints` blocking rules against concept route skeletons; violations returned to Concept Architect as machine-readable feedback for ONE regeneration attempt; still-failing concepts discarded with reason recorded in `discarded_alternatives` | P3.7, P2.9 |
| P3.9 | Pipeline v0 assembly: `profiler → concept → constraint_gate → (stub agents fill placeholder days) → narrator-stub` producing a valid skeleton PlanGraph; full SSE event stream (agent.started/thought/graph.patch/job.completed) per ARCH §6.3 | P3.6–P3.8 |
| P3.10 | Intake UI: **PromptCanvas** (landing) with cycling example placeholders + language auto-detect chip; **UnderstandingEcho** (editable confidence-tinted chips → profile field updates); **ClarifierCard** (one at a time, tap answers, "because" line, skippable, "Just plan it" always visible); **AgentProgressRail** consuming SSE; skeleton plan document rendering route + days from streamed patches | P0.11, P0.12, P3.9 |
| P3.11 | Intake tRPC routes: `intake.parsePrompt`, `intake.getNextClarifiers`, `intake.answerClarifier`, `intake.updateProfileField`, `plan.generate` (enqueues job); `clarifier_log` written | P3.9 |
| P3.12 | Eval harness v1 (`/evals`): runner that executes briefs through the pipeline on mocks, deterministic checks (schema-valid graph, zero blocking violations), Langfuse-logged; seed with 20 golden briefs; wire into CI for `packages/agents` PRs | P3.9 |

**Exit Gate P3:**
- [ ] E2E (Playwright): type the PS §4.1 brief #1 → echo shows correct chips → answer 2 clarifiers → generation streams live → skeleton plan renders with route, day placeholders, and concept narrative. Under 60s on mocks.
- [ ] "Ladakh road trip in January" brief → constraint gate rejects, user sees the winter-alternative concept with the honest reason. (The vibes-and-constraints behavior, verified.)
- [ ] "Surprise me, 6 days, ₹40k" → 3 contrasting concepts render for user pick.
- [ ] Kill worker mid-generation → job resumes from checkpoint and completes.
- [ ] Eval harness: 20/20 briefs produce schema-valid, violation-free skeletons in CI.
- [ ] Token ledger enforced: artificially low budget → graceful degradation event, not crash.

---

## PHASE 4 — Domain Agents (the depth)

**Objective:** Route realism, stays, experiences, food, logistics, budget, risk — the full graph populated with grounded, reasoned, linked content. Still on mocked providers; KB is live.
**References:** ARCH §7.2–7.3; PS §5.1 (agent roster), §6 (output spec drives what agents must produce).

Each agent task below shares a uniform DoD: implements `Agent<In,Out>` contract; ownership declared and enforced; every emitted node carries `Reasoning{summary, profile_refs[]}` and `SourceRef[]` or `verify_flag`; cassette contract tests; ≥5 eval briefs exercising it added to `/evals`.

| ID | Task | Depends |
|---|---|---|
| P4.1 | **Route Optimizer:** route skeleton → ordered stops with nights + realistic inter-city legs. Uses `maps.distanceMatrix` + KB road-realism + rail schedules; enforces pace/energy curve, buffer-day placement (before intl departure; after altitude arrival), arrival-time safety logic (no late-night arrivals for solo-female/heightened-safety profiles). Emits transit legs with `realistic_duration` distinct from scheduled | P3 |
| P4.2 | **Logistics Agent:** per leg — mode decision + operator/service refs (train numbers via `rail.schedule`, flight options), class recommendation with reasoning, booking channel + `opens_at` + waitlist-risk heuristic from KB, deep-link construction, airport/station arrival playbooks, per-city intra-city transport card | P4.1 |
| P4.3 | **Stay Curator:** per stop — `hotels.search` candidates → score against `taste.stay_styles` + location-to-plan distance (uses day blocks once available; two-pass with P4.4) → primary + 2 alternates (one cheaper, one splurge) each with links, price band, cancellation note, taste-match + mobility-fit reasoning | P4.1 |
| P4.4 | **Experience Curator:** per day — blocks with time-window intelligence (sunrise/crowd-avoidance from KB best-time data), interest-weight-driven selection, one "earned" offbeat gem per leg (KB semantic search), insider layer (correct gate, what to skip, dress code), 1–2 alternatives per major block, anti-preference respect verified against profile | P4.1, P2.4–P2.5 |
| P4.5 | **Food Curator:** meal slots per day — venue + dish-level guidance + fallback; dietary flags hard-filtered; street-food hygiene tiers from KB; food-as-destination days when `interests.food ≥ 4` | P4.4 |
| P4.6 | **Budget Reconciler:** deterministic ledger assembly from node costs (`packages/constraints` math helpers, NOT LLM) + LLM only for trade-off narrative; totals vs stated, confidence bands (booked vs estimate), 2–3 costed trade-offs; tier-consistency check | P4.2–P4.5 |
| P4.7 | **Risk & Resilience:** fragile-leg register (fog seasons at DEL Dec–Jan from KB, waitlist risk from logistics, landslide seasons), concrete plan-B per fragile leg (pre-computed alternate leg or day-swap), emergency card per city (KB safety notes), personalised health notes (altitude protocol when relevant) | P4.2, P4.4 |
| P4.8 | **Pretrip + Packing generators** (deterministic from graph): T-countdown checklist (train booking windows, visa lead times, safari windows), packing list from region×season×activities×party matrix | P4.6, P4.7 |
| P4.9 | Parallel-stage orchestration: stays/experiences/food/logistics run concurrently on the shared graph via ownership-disjoint patches; two-pass reconciliation (stays re-scored after day blocks exist); budget+risk sequential after | P4.1–P4.7 |
| P4.10 | Eval expansion to 60 briefs spanning personas (PS §2) × regions (Rajasthan, Kerala) × seasons × edge cases (wheelchair, ₹15k shoestring, 65+ parents, Diwali dates, wedding anchor). Deterministic checks extended: every day within max-travel-hours; every leg has booking info; every meal respects diet flags; budget within ±10% or justified | P4.1–P4.9 |

**Exit Gate P4:**
- [ ] Full graph for golden brief #1 contains: complete days (blocks+meals+insider notes), stays with 2 alternates each, legs with train numbers/booking windows/links, budget ledger reconciling to ±10%, ≥1 plan-B, pretrip timeline, packing list — all schema-valid, all constraint rules green.
- [ ] Grounding audit: script samples 50 factual nodes across 5 plans → 100% have `SourceRef` or `verify_flag`. Zero unlabelled assertions.
- [ ] Anti-preference test: "hates crowds" profile → no peak-slot Amber Fort; verified by rule + manual review of 3 plans.
- [ ] Eval: 60/60 schema-valid + zero blocking violations; curation quality reviewed by human on 10 sampled plans with written notes filed in `/evals/reviews/`.
- [ ] p95 full-pipeline time on mocks < 60s; token cost per plan logged and < budget.

---

## PHASE 5 — Critic, Narrator & the Magic Loop UI

**Objective:** Quality gate + beautiful output. The complete PS §6 itinerary document, streamed, in the Raah design language. Internal demo ships at gate.
**References:** ARCH §4.2, §7.4–7.5, §14.4; PS §6 (entire), §15.

| ID | Task | Depends |
|---|---|---|
| P5.1 | **Critic agent:** full-draft review against PS §15 rubric; different model family (router policy `task_class: critique` → OpenAI gpt-5-mini for real plans, free-tier reasoning model for eval runs, per ARCH §7.6/ADR-014); input is a **condensed graph rendering** (day summaries + reasoning lines + timing/crowd metadata, not raw JSONB); output `CriticReport{score, issues[{node_ref, criterion, severity, suggested_fix}]}`; issues→DirtySet→targeted fix loop (max 3 iters, ARCH §7.4); ship-with-flags path for non-blocking residuals. Planted-defect test runs against ALL candidate critic models to pick/validate the router policy | P4 |
| P5.2 | **Constraint re-gate:** final full-graph deterministic validation post-critic; blocking violation = job fails with internal alert (must be unreachable in practice — alert means agent bug) | P5.1 |
| P5.3 | **Narrator:** validated graph → user-facing document content — trip narrative, "Why this trip" panel (5–8 major decisions from concept + route reasoning), per-block reasoning lines polished to voice guidelines (ARCH §4.3), assumptions ledger from profile provenance (`inferred`/default fields), discarded alternatives; generates natively in target language (en now, hi in P8) | P5.1 |
| P5.4 | Itinerary document UI — overview: trip header, interactive route map (Google Maps JS island), trip stats bar (transit-to-experience ratio etc.), WhyCallout panel, AssumptionChip row, discarded-alternatives accordion | P5.3, P0.11 |
| P5.5 | Itinerary document UI — days: DayCard/TimelineBlock components per ARCH §4.2 spec (time, map-chip, cost, always-visible why-line, expandable insider layer), meal slots, energy rating, buffer honesty notes; `/trip/[id]/day/[n]` mobile nav | P5.4 |
| P5.6 | Itinerary document UI — annexes: LogisticsLeg components (duration-honesty bar, booking-window countdown, deep links), BudgetLedger (line items, confidence bands, actionable trade-off rows), FragileLegFlag + plan-B sheets, pretrip timeline, packing list | P5.5 |
| P5.7 | Streaming assembly UX: overview hydrates first, days in order, annexes last (ARCH §3.2); AgentProgressRail collapses into finished doc; generation-failure states with resumability messaging | P5.4–P5.6 |
| P5.8 | Eval harness v2: LLM-judge scoring on PS §15 criteria (personalisation traceability, taste, reasoning quality) calibrated against 10 human-rated plans; critic-score + judge-score regression gates in CI for agent/prompt PRs; nightly full-suite trend dashboard | P5.1, P4.10 |
| P5.9 | Internal demo checklist: 5 scripted briefs runnable live; seeded demo accounts; feedback capture form | P5.7 |

**Exit Gate P5:**
- [ ] Critic catches planted defects: a test plan with a 9-hour-drive day, a crowds-violation, and two consecutive "full" days for a low-pace profile → all three flagged with correct node refs and fixed within the loop.
- [ ] Golden brief #1 renders the COMPLETE PS §6 document — every section present, every block with a visible why-line, every bookable item linked or honestly labelled.
- [ ] E2E golden flow (prompt→clarify→generate→full doc) green in CI; axe clean; Lighthouse budgets met on `/trip/[id]`.
- [ ] LLM-judge scores ≥ calibrated threshold on 60/60 eval briefs; first-iteration critic pass rate ≥70%.
- [ ] 5 humans run the internal demo unassisted; feedback filed.

---

## PHASE 6 — Refinement Loop, Exports & Sharing

**Objective:** The conversation that makes plans *theirs*: chat edits with diffs, swaps, locks, versions — plus PDF/ics/share/poster.
**References:** ARCH §3.2 (optimistic edits, diff rendering), §5.3–5.4, §6.2; PS §7, §6.8.

| ID | Task | Depends |
|---|---|---|
| P6.1 | Edit-intent parser (small model): chat message → typed `PatchIntent` (`lighten_day(5)`, `swap_stop(jaipur→bundi)`, `add_constraint(no_stairs)`, `extend_trip(+1d)`, `regenerate(scope)`) with confidence; ambiguous → one clarifying question, never a guess | P5 |
| P6.2 | Revision pipeline (`plan.revise` queue, fast lane): intent → DirtySet (P1.4) → re-run owning agents only → critic (scoped) + constraint re-gate (full) → new version with diff. p95 < 20s target measured | P6.1 |
| P6.3 | Profile learning from edits: edit stream → profile deltas with provenance `inferred_from_edit` → light UI confirmation ("Noted — fewer forts, more markets"); deltas applied to future regenerations | P6.1 |
| P6.4 | Diff UI: DiffBanner + per-hunk accept/revert (rendered from `summarizeDiff`); version history view with compare + rollback (`plan.rollback` → new version) | P6.2 |
| P6.5 | Inline controls: SwapSheet (apply alternative = optimistic patch + validation job), lock/unlock nodes (locked survive regeneration — engine-enforced), drag-reorder days (triggers revision job for legs/energy re-plan) | P6.2 |
| P6.6 | PDF export: `/trip/[id]/print` route (paged CSS, one-page-per-day option, print typography) + Playwright pool in worker (`plan.export`) → S3 → signed URL. Visual regression test on print route | P5.6 |
| P6.7 | Calendar (.ics with venues/geo per block) + WhatsApp-friendly text summary generator + TripPoster OG-image pipeline (satori/resvg) | P6.6 |
| P6.8 | Sharing: share_links tokens (view/comment, optional expiry), `/trip/[id]/share/[token]` read-only view (CDN-cached, busted on version bump), commenter role with per-block comments, member management UI | P0.9, P5.6 |
| P6.9 | Trips dashboard (`/trips`) + traveller-profile personas UI (`/profile`, "me solo"/"family mode") | P0.9 |

**Exit Gate P6:**
- [ ] E2E: "make day 5 lighter" → diff banner shows removed block + added free time with reasons → accept → version history shows v2 with correct parent/diff → rollback works.
- [ ] "My mother is joining, she can't do stairs" → profile gains mobility constraint (provenance `inferred_from_edit`) → affected stays re-scored (haveli-with-stairs replaced) → diff shown. Locked hotel survives an unrelated full regeneration.
- [ ] p95 revision latency < 20s on staging across 20 scripted revisions.
- [ ] PDF export pixel-reviewed on 3 golden plans (en, incl. Devanagari venue names render correctly); .ics imports cleanly into Google Calendar; share link renders logged-out with correct permissions.

---

## PHASE 7 — Live Providers & Private Beta

**Objective:** Swap mocks for reality behind flags, one provider at a time; run a private beta.
**References:** ARCH §10 (adapter pattern), §8.2 (cache TTLs), §18; PS §10.

Adapter DoD (uniform): implements `ProviderAdapter` with timeout/retry/circuit-breaker; normalizer with unit tests; cache policy per ARCH §8.2; rate-limit ledger respected; nightly live-smoke test; feature flag `provider.<name>`; graceful-degradation path verified (breaker open → typed fallback behavior, PS risk table).

| ID | Task | Depends |
|---|---|---|
| P7.1 | Google Maps Platform live: Places, Directions, Distance Matrix, Static Maps; distance-matrix memoization (30d, od-pair keyed) verified against quota math | P6 |
| P7.2 | Weather (Open-Meteo) + AQI (IQAir/CPCB) + FX live | P6 |
| P7.3 | Hotels **deep-link tier** (ARCH §10.1): KB-curated stays enriched via Google Places details; deep links to Booking/MMT/Agoda search URLs with dates+party pre-filled; prices labelled `estimate`. Affiliate APIs are a flagged future adapter — build the adapter interface, not the paid integration | P7.1 |
| P7.4 | Rail **deep-link tier**: KB schedule knowledge + booking-window math (already in constraints) + deep links to IRCTC/ConfirmTkt; waitlist heuristics from KB. Live availability API = future adapter behind flag | P6 |
| P7.5 | Flights **deep-link tier**: Google Flights/Skyscanner deep links with route+dates pre-filled; fare guidance from KB seasonal knowledge, labelled `estimate` | P6 |
| P7.6 | Experiences: KB-curated + official-site link-out (affiliate APIs = scale phase) | P6 |
| P7.7 | Price-watch **deferred to scale phase** (requires live fare APIs). Build only the `price_watches` table + UI affordance stub behind a disabled flag | — |
| P7.8 | Notifications: Resend email (itinerary delivery, share invites) + "Copy for WhatsApp" formatted-summary button (no WhatsApp API) | P6.7 |
| P7.9 | Link-integrity job: weekly crawl of outbound links in active trips; dead links → `verify_flag` + curation review queue | P7.3–P7.6 |
| P7.10 | **Private beta (15–30 users — friends, r/IndiaTravel volunteers):** deploy per ARCH §13.0; weekly factual spot-check audit by founder (5 plans/wk); feedback captured in a GitHub project board; eval set grown toward 100 briefs incl. beta-inspired cases | P7.1–P7.8 |

**Exit Gate P7:**
- [ ] Live adapters (maps, weather, AQI, FX) green on nightly smoke for 7 consecutive days; Google Maps usage inside free credit with quota alarm tested; deep-link tiers verified (20 spot-checked links open the right page with dates pre-filled).
- [ ] Factual spot-check pass rate ≥98% across two consecutive weekly founder audits (5 plans each).
- [ ] LLM cash cost per plan = $0 on the free-tier routing (ARCH §7.6 bootstrap policy / ADR-013); token ledger still tracked per plan so the paid-routing cost is known in advance; free-tier daily quota never exhausted by beta traffic (rate-limit ledger verified under 2× beta load).
- [ ] 10+ beta users completed a full plan; ≥5 exported or shared; funnels visible in PostHog (self-hosted or free cloud tier).
- [ ] Zero Sev-1 incidents open; incident notes kept as runbook seeds.

---

## PHASE 8 — Hardening & Public Launch

**Objective:** Enterprise-grade nonfunctionals: performance, offline, Hindi, security, scale, operations.
**References:** ARCH §3.3–3.4, §12, §13, §14, §15, §16 (load), §18; PS §9.

| ID | Task | Depends |
|---|---|---|
| P8.1 | Offline PWA: Workbox precache shell; "Download trip" (graph JSON + static map tiles per day + venue cards, size shown); airplane-mode E2E test renders full itinerary + emergency cards | P6 |
| P8.2 | Low-bandwidth mode: auto-detect + manual flag; static maps, no motion, deferred images; tested on throttled 3G profile | P8.1 |
| P8.3 | Hindi launch: `hi` locale complete; Narrator native-Hindi generation path with voice-guideline review by native speaker; Hindi E2E on golden flow; Devanagari rendering audit across UI + PDF | P5.3 |
| P8.4 | Performance: hit all ARCH §3.4 budgets on mid-tier Android/4G (measured via WebPageTest); trip-doc CDN caching with version-tag revalidation; bundle audit | P6 |
| P8.5 | Load & resilience (bootstrap scale): k6 — 10 concurrent generations sustained, SSE fan-out 500 clients, queue backpressure (worker at max → jobs queue with honest UI wait estimates, no drops); chaos drill: Redis restart + provider outage mid-run → all jobs resume | P7 |
| P8.6 | Security (solo-budget version): Semgrep/Trivy/Renovate gates verified; prompt-injection red-team suite (adversarial briefs + poisoned content in KB fixtures) added to evals and CI; OWASP ZAP baseline scan (free) + manual checklist against ASVS L1; secrets rotation drill; security contact page. External pen test = scale phase, pre-monetisation | P7 |
| P8.7 | Privacy basics: consent flows, field-level encryption on sensitive profile fields verified, hard-delete within 30d tested end-to-end (incl. R2 exports + Langfuse traces), LLM zero-retention configs audited, plain-language privacy policy published | P7 |
| P8.8 | Operations: dashboards for all §14.3 SLOs + §14.2 cost metrics; paging rules (SLO burn, cost anomaly, spot-check <95%); runbooks (provider outage, model outage/fallback, queue saturation, bad-KB rollback); backup-restore drill executed and timed vs RTO/RPO | P7 |
| P8.9 | Growth surface: `/inspiration/[slug]` edge-cached concept pages (SEO), TripPoster share polish, landing-page final content pass | P6.7 |
| P8.10 | Launch checklist: WAF+rate limits verified under load; anonymous 1-plan flow friction-tested; feature-flag launch config frozen; rollback plan rehearsed; go/no-go review against BOTH exit-gate archives and open-risk register | P8.1–P8.9 |

**Exit Gate P8 = Launch:**
- [ ] All ARCH §14.3 SLOs met for 14 consecutive days on prod under beta + load-test traffic.
- [ ] Airplane-mode itinerary, Hindi golden flow, and 3G low-bandwidth flow all pass E2E.
- [ ] ZAP baseline + ASVS L1 checklist clean; red-team eval suite green; deletion drill verified.
- [ ] Nightly eval suite ≥ launch threshold for 14 days with zero regressions; factual audit ≥98% for 4 consecutive weeks.
- [ ] On-call rota, runbooks, and paging live; go/no-go review signed.

---

## 9. Cross-Phase Tracks (continuous, owned throughout)

| Track | Cadence | Requirement |
|---|---|---|
| **KB expansion** | From P4 onward | Demand-driven, not schedule-driven: usage data surfaces the most-planned destinations; founder verifies the highest-traffic entities first via P2.10 (~30 min sessions). All-India coverage never blocks on KB depth — uncurated destinations plan from live data with honest depth labels (PS §13 coverage posture) |
| **Eval growth** | Every phase | Every bug found in any phase becomes an eval brief or a constraint fixture before the fix merges ("no fix without a failing test first") |
| **Prompt hygiene** | Continuous | No prompt edits outside versioned files; every prompt PR runs the harness; regressions block |
| **Design QA** | Every UI phase | Weekly review against ARCH §4 (voice, motion restraint, a11y); visual-regression suite grows with each signature component |
| **Cost review** | Weekly from P4 | On free-tier routing the tracked metric is **quota consumption** (requests/day per provider) alongside token cost-per-plan (what paid routing *would* cost); regressions >20% require investigation before new features. Nightly eval suite runs on a dedicated key, overnight, and caps at a brief-count that fits the day's remaining quota (full 100-brief suite weekly) |
| **Documentation** | Every phase | Package READMEs, ADRs for every deviation, runbooks from P7 |

---

## 10. Risk Register (implementation-specific, beyond PS §14)

| Risk | Trigger sign | Mitigation baked into plan |
|---|---|---|
| Agents produce valid-but-mediocre plans (quality plateau) | Judge scores flat, edit-depth high in beta | Human calibration reviews at P4.10/P5.8; taste KB investment (cross-phase track); critic rubric iteration is flagged, evaluable work |
| Critic loop thrashing (fix→break→fix) | Iteration cap hit frequently | Scoped critic in revisions; ownership rails prevent cross-damage; telemetry on per-criterion pass rates isolates the misbehaving agent |
| Provider API terms block a planned integration | Contract review at P7 start | Every provider has a designed degradation path (adapter DoD); no agent hard-depends on live availability |
| LangGraph limitation discovered late | Any P3 blocker | `AgentRuntime` wrapper (ARCH ADR-003) keeps migration cost bounded; checkpoint format is ours, not the framework's |
| KB authoring becomes the bottleneck | Coverage dashboard slips 2 sprints | `kb-verifier` draft-assist agent (ARCH §9.3) prioritized as internal tooling; circuit order follows demand data from beta |
| Eval LLM-judge drift | Judge/human rating divergence >1 band | Quarterly recalibration against fresh human ratings is a standing P8.8-style operational task |

---

## 11. Master Exit-Gate Summary (print this)

| Phase | One-line gate |
|---|---|
| P0 | Full stack boots locally; CI enforces every rule; auth + SSE heartbeat work |
| P1 | PlanGraph + constraints at 95% coverage; property tests green; versioning round-trips |
| P2 | KB validates in CI; Rajasthan+Kerala ≥90% complete; constraints run on real data |
| P3 | Brief → clarifiers → constraint-checked skeleton plan, streamed to real UI; resumable; 20-brief eval green |
| P4 | Complete grounded graph (stays/experiences/food/logistics/budget/risk); 60-brief eval green; zero unlabelled facts |
| P5 | Critic catches planted defects; full PS §6 document renders beautifully; internal demo passes |
| P6 | Chat edits with diffs/locks/versions; PDF/ics/share/poster ship |
| P7 | Live providers with proven degradation; ≥98% factual audits; beta cohort active; cost on target |
| P8 | SLOs 14 days green; offline + Hindi + security + scale proven; launch |

---

*End of implementation plan.*
