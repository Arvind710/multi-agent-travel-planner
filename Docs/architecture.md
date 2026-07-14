# Architecture: AI-Powered Multi-Agent Travel Planner for India

**Companion to:** `problemstatement.md` v1.0
**Version:** 1.0 — July 2026
**Intent:** A decisive, no-ambiguity technical architecture for a production-grade, enterprise-quality web application. Every choice below is a decision, not an option list. Deviations require an ADR (§20).

---

## 0. Architectural Principles

1. **Plans are jobs, not requests.** Generation takes 30–90s. Everything is queue-based and streamed; nothing user-facing blocks on an LLM.
2. **The plan graph is the product.** A typed, versioned data structure — not prose — is the single source of truth. Agents mutate the graph; the UI renders the graph; exports serialize the graph.
3. **Determinism at the edges, intelligence in the middle.** Constraint validation, budget math, date logic, permit rules = code. Taste, curation, narrative, critique = LLMs. Never let an LLM do arithmetic or calendar math that code can do.
4. **Grounded or labelled.** Every factual node carries `sources[]` or a `verify_before_booking` flag. Model memory is never a source.
5. **Targeted recomputation.** Edits invalidate subgraphs, not plans. Cost and latency scale with the size of the change.
6. **Everything traced.** Every agent step, tool call, token count, and graph mutation is an OpenTelemetry span. If it can't be replayed, it can't be debugged.
7. **Boring infrastructure, novel product.** Postgres, Redis, S3, containers. Innovation budget is spent on the agent layer and the experience, not on exotic databases.
8. **Mobile-first, India-first.** p75 Indian mobile network is the performance target, not desktop broadband. Low-bandwidth and offline paths are designed, not retrofitted.

---

## 1. System Context (C4 Level 1)

```
                        ┌──────────────────────────────────────────┐
                        │                TRAVELLER                 │
                        │  (mobile web / desktop / PWA / WhatsApp) │
                        └───────────────┬──────────────────────────┘
                                        │ HTTPS / SSE
                        ┌───────────────▼──────────────────────────┐
                        │          WEB APPLICATION (Next.js)       │
                        │  UI · streaming plan renderer · exports  │
                        └───────────────┬──────────────────────────┘
                                        │ tRPC / REST
      ┌─────────────────────────────────▼───────────────────────────────────┐
      │                        CORE PLATFORM (API + Workers)                │
      │  ┌────────────┐ ┌──────────────────┐ ┌───────────┐ ┌─────────────┐ │
      │  │  Trip API  │ │ Agent Orchestra- │ │ KB Service│ │ Integrations│ │
      │  │  service   │ │ tion Engine      │ │ (India KB)│ │ Gateway     │ │
      │  └────────────┘ └──────────────────┘ └───────────┘ └─────────────┘ │
      └──────┬───────────────┬───────────────────┬───────────────┬─────────┘
             │               │                   │               │
      ┌──────▼─────┐  ┌──────▼──────┐   ┌────────▼───────┐  ┌────▼─────────────────────┐
      │ PostgreSQL │  │ Redis        │   │ Object storage │  │ External providers        │
      │ (+pgvector)│  │ (cache/queue)│   │ (S3: exports,  │  │ LLMs · Maps · Flights ·   │
      │            │  │              │   │  assets)       │  │ Rail · Hotels · Weather · │
      └────────────┘  └─────────────┘   └────────────────┘  │ AQI · Experiences · FX    │
                                                             └───────────────────────────┘
```

---

## 2. Technology Stack (decided)

| Layer | Choice | Rationale |
|---|---|---|
| Language (full stack) | **TypeScript end-to-end** | One language across UI, API, workers, agents = maximum leverage for AI-assisted development in Antigravity; shared types from DB to UI eliminate a whole class of bugs |
| Runtime | **Node.js 22 LTS** | |
| Frontend framework | **Next.js 15 (App Router, RSC)** | Streaming SSR fits the streamed-plan UX natively; PWA support; edge-cacheable marketing/inspiration pages |
| API layer | **tRPC** (internal) + **REST (OpenAPI)** for public/partner surface | tRPC gives full type-safety UI↔API; OpenAPI kept for future mobile apps/partners |
| Agent orchestration | **LangGraph (TS)** on a custom typed state | Explicit graph state machine, checkpointing, human-in-the-loop interrupts, replay — matches §5 pipeline exactly. Wrapped behind our own `AgentRuntime` interface so it's swappable |
| LLM access | **Vercel AI SDK / direct SDKs behind a `ModelRouter`** — bootstrap routing is **free-tier-first** (Gemini free tier + Groq/Mistral free tiers; see §7.6) | Provider-agnostic; zero LLM cash spend at bootstrap; paid frontier routing is a config flip when revenue/credits exist |
| Validation | **Zod everywhere** | Single schema source for tRPC, agent I/O contracts, DB DTOs, and LLM structured outputs |
| ORM | **Drizzle** | Type-safe, SQL-transparent, plays well with pgvector |
| Database | **PostgreSQL 16 + pgvector** | Profiles, trips, plan graphs (JSONB), versions, KB retrieval vectors — one operationally boring store |
| Queue | **BullMQ on Redis** | Plan-generation jobs, revision jobs, price-watch jobs, KB ingestion |
| Realtime | **SSE (primary)** + resumable via `Last-Event-ID` | Simpler than WebSockets through Indian mobile proxies/firewalls; one-directional fits our streaming needs |
| Cache | **Redis** (+ HTTP cache headers + Next.js data cache) | |
| Object storage | **S3-compatible** | PDF exports, OG images, poster art, KB snapshots |
| Maps | **Google Maps Platform** (Places, Directions, Distance Matrix, Static + JS Maps) — within the free monthly usage credit, enforced by the caching layer (§8.2) and a hard quota alarm | Unmatched India POI coverage; aggressive distance-matrix memoization keeps a hobbyist project inside free credit |
| Styling / components | **Tailwind CSS 4 + shadcn/ui (Radix primitives)**, custom design system on top (§4) | Accessible primitives, full visual control, AI-toolchain-friendly |
| Motion | **Framer Motion** | §4.4 motion language |
| Auth | **Auth.js v5**: Google OAuth + email magic link (Resend free tier) | Phone OTP (MSG91) deferred to scale phase — costs money, adds a vendor |
| Payments (future) | Razorpay (domestic) + Stripe (international) | |
| PDF export | Server-side **Playwright print-to-PDF** of a dedicated print route | One rendering pipeline (the web view IS the PDF source); no duplicated layout logic |
| Email/WhatsApp | Resend (email, free tier). WhatsApp Business Cloud API **deferred to scale phase** (requires business verification + per-message cost) | A copy-to-WhatsApp text summary button delivers 80% of the value for free |
| Infra | **Bootstrap:** Vercel (web) + **one small VPS or Railway/Fly.io instance** running api + worker via docker-compose + **Neon Postgres** (pgvector, free tier) + **Upstash Redis** (free tier) + **Cloudflare R2** (S3-compatible, free tier) | Total ≈ $0–20/month. The AWS ap-south-1 topology in §13 is the *scale path*, activated only when revenue exists |
| IaC | None at bootstrap — infra is dashboard-configured and documented in `/infra/README.md`; Terraform deferred to scale phase | |
| CI/CD | GitHub Actions → staging → prod with migration gates | |
| Observability | **Langfuse Cloud (free tier)** for LLM traces/evals + structured pino logs + OTel instrumentation kept in code (exporter off until scale phase) | Instrumenting now is free; running Grafana isn't |
| Error tracking | Sentry (free tier) | |
| Feature flags / experiments | **Typed config-file flags** in `packages/shared/flags.ts` (env-overridable) | Unleash deferred; a typed object gives the same code seam for free |

**Monorepo:** Turborepo + pnpm.

```
/apps
  /web            → Next.js app (UI, print routes, PWA)
  /api            → tRPC + REST gateway (thin; delegates to packages)
  /worker         → BullMQ consumers: plan jobs, revisions, exports, price-watch, KB ingestion
/packages
  /agents         → agent definitions, prompts, LangGraph graphs, ModelRouter
  /plan-graph     → the canonical PlanGraph types, Zod schemas, mutation + diff engine
  /kb             → India KB: content repo loaders, retrieval, verification tooling
  /integrations   → provider adapters (flights, rail, hotels, maps, weather, aqi, fx, experiences)
  /constraints    → deterministic validators (seasons, permits, closures, budget math, pacing)
  /db             → Drizzle schema + migrations
  /ui             → design system components (tokens, primitives, plan-rendering components)
  /shared         → shared utils, i18n, currency, date logic (all date math in Luxon, IST-aware)
/content
  /kb             → versioned YAML/JSON knowledge entities (git-reviewed, §9)
/infra            → Terraform
/evals            → golden briefs, plan-quality eval harness (§14.4)
```

---

## 3. Frontend Architecture

### 3.1 Route map

```
/                        Landing: single prompt box, inspiration gallery
/plan/new                Conversation surface: understanding echo → clarifying Qs → generation progress
/trip/[id]               The Itinerary Document (canonical interactive view)
/trip/[id]/day/[n]       Deep-linked day view (mobile primary nav)
/trip/[id]/logistics     Logistics dossier
/trip/[id]/budget        Budget sheet
/trip/[id]/print         Print/PDF route (Playwright target; no chrome, paged CSS)
/trip/[id]/share/[token] Read-only/comment share view
/trips                   Saved trips dashboard
/profile                 Traveller profiles ("me solo", "family mode")
/inspiration/[slug]      SEO/edge-cached trip-concept pages (growth surface)
```

### 3.2 Rendering & state strategy

- **RSC by default.** Trip documents render server-side from the plan graph; interactive islands (swap controls, chat, map) are client components.
- **Server state:** TanStack Query over tRPC, normalized by plan-graph node ID. **No client state duplication of the graph** — the graph is the store; UI state (open panels, map viewport) lives in Zustand.
- **Streaming generation UX:** the `/plan/new` surface subscribes to the job's SSE channel. Events (§6.3) drive: agent-progress timeline ("Route Optimizer: testing 4 sequences…"), skeleton-to-content hydration of the plan document as subgraphs finalize (overview first, then days in order, then annexes).
- **Optimistic edits:** swaps/locks/reorders apply optimistically to the local graph copy with rollback on job failure; a revision job re-validates.
- **Diff rendering:** revisions return a graph diff (§5.4); UI renders change highlights ("Day 5 lightened: removed 1 fort, added 2h free time") with accept/revert per hunk — a "track changes for trips" experience.

### 3.3 PWA & offline (India-first)

- Installable PWA; service worker (Workbox) precaches app shell.
- **Finalized trips are cached offline in full**: plan graph JSON + static map tiles per day + venue cards. "Download trip" is an explicit, visible action with size shown.
- Low-bandwidth mode (flag + auto-detect via Network Information API): static maps instead of GL, no motion, deferred images.
- All itinerary-critical info (addresses, train numbers, emergency card) render from cached graph with zero network.

### 3.4 Performance budgets (enforced in CI via Lighthouse CI)

| Metric | Budget |
|---|---|
| LCP (landing, 4G mid-tier Android) | < 2.0s |
| TTI trip document | < 3.5s |
| JS bundle (landing) | < 150KB gz |
| JS bundle (trip doc, hydrated islands) | < 300KB gz |
| First streamed generation event | < 5s after submit |

---

## 4. Design System — "Raah" (the working design language)

Inspiration set, deliberately chosen: **Airbnb** (warmth, trust, editorial travel photography discipline), **Linear** (surface polish, motion restraint, keyboard-grade responsiveness), **Stripe Docs** (progressive disclosure of dense information), **Arc/Notion** (document-as-product feel), **Headout/Rome2Rio** (logistics legibility). The itinerary document should feel like a beautifully typeset travel magazine feature that happens to be interactive — not a SaaS dashboard.

### 4.1 Foundations

- **Type:** `Fraunces` (display — editorial warmth for trip titles, day headers) + `Inter` (UI/body) + `JetBrains Mono` (train numbers, PNRs, codes). Full Devanagari + Indic script fallback stack (`Noto Sans` family) — the type system must be tested in Hindi from day one, not patched later.
- **Type scale:** 1.25 modular scale; trip-document body 17px/1.65 (long-read comfort), UI 14–15px.
- **Color:** warm neutral base (paper `#FAF8F5`, ink `#1A1714`); accent from Indian pigment palette — primary **madder red** `#B3432B`, secondary **indigo** `#2C3E66`, support **turmeric** `#D99A2B`, **peepal green** `#4A7C59`. Semantic tokens only (`--color-surface`, `--color-accent`, `--color-warning`…); dark mode is a first-class token theme.
- **Spacing:** 4px base grid; document layout on an 8pt rhythm; max text measure 68ch.
- **Elevation:** flat + hairline borders by default (editorial), shadow reserved for overlays and the map.
- **Iconography:** Lucide, 1.5px stroke, plus a small custom set (train classes, permit, altitude, monsoon).

### 4.2 Signature components (the ones that define the product)

| Component | Behavior |
|---|---|
| **PromptCanvas** | Landing input: large, calm, placeholder cycles real example briefs; voice button; language auto-detect chip |
| **UnderstandingEcho** | Extracted-profile chips (editable, confidence-tinted); low-confidence chips pulse gently once |
| **ClarifierCard** | One question at a time, 3–5 tap answers + free text, always shows its "because" line, always skippable |
| **AgentProgressRail** | Streamed generation timeline; each agent gets a verb-first status line; collapses into the finished doc |
| **DayCard / TimelineBlock** | The core itinerary unit: time, title, map-chip, cost, one-line *why* (accent-colored, always visible), expandable insider layer, swap affordance |
| **WhyCallout** | Reasoning blocks — visually distinct (indigo hairline, serif), because reasoning is the brand |
| **AssumptionChip** | Amber-tinted inline labels ("Assumed: no overnight trains — tap to change") |
| **SwapSheet** | Bottom sheet with 1–2 alternatives, trade-offs stated, one-tap apply → optimistic graph patch |
| **DiffBanner** | Post-revision change summary with per-hunk accept/revert |
| **LogisticsLeg** | Mode icon, operator, duration honesty bar (scheduled vs realistic), booking-window countdown, deep link |
| **BudgetLedger** | Grouped line items, confidence bands, trade-off suggestions as actionable rows |
| **FragileLegFlag** | Risk annex inline marker with the pre-planned fallback one tap away |
| **TripPoster** | Generated shareable visual summary (OG image pipeline, satori/resvg) |

### 4.3 Content voice

Warm, precise, never breathless. Reasoning lines are one sentence, second person, tied to the profile ("You rated crowds a dealbreaker — this slot is 7am, an hour before the buses"). No exclamation-mark tourism copy. Hindi/Indic voice guidelines written alongside English, not translated after.

### 4.4 Motion

Linear-school restraint: 150–250ms ease-out for state changes; content streams in with a single 12px fade-rise; **no** parallax, **no** scroll-jacking. Motion communicates state (generating → done, diff applied), never decorates. `prefers-reduced-motion` fully honored.

### 4.5 Accessibility

WCAG 2.2 AA enforced in CI (axe). Radix primitives for all interactive components; full keyboard path through clarifier flow and swap sheets; screen-reader narration of the generation progress ("3 of 9 agents complete"); contrast-checked palette in both themes; Hindi screen-reader testing on the top flows.

---

## 5. The Plan Graph (canonical domain model)

The heart of the system. A typed, versioned, immutable-per-version document.

### 5.1 Structure

```
PlanGraph
├─ meta: {trip_id, version, profile_version, status, critic_score, created_by_job}
├─ concept: {title, narrative, region_strategy, discarded_alternatives[]}
├─ route: OrderedStops[{stop_id, place, arrive, depart, nights, rationale}]
├─ days: Day[]
│   └─ Day {date, stop_id, theme, energy_rating, weather_normals,
│           blocks: Block[], meals: MealSlot[], buffer_notes}
│       └─ Block {block_id, kind: experience|transit|meal|rest|anchor,
│                 time_window, title, place_ref, duration, cost: Money,
│                 reasoning: Reasoning, insider_notes, links[],
│                 alternatives: Block[], locks: LockState,
│                 sources: SourceRef[], verify_flag: boolean}
├─ stays: StayAssignment[{stop_id, primary: Stay, alternates: Stay[2], reasoning}]
├─ legs: TransitLeg[{from, to, mode, operator, service_ref, classes, realistic_duration,
│                    booking: {channel, opens_at, urgency, waitlist_risk}, links[], fallback_ref}]
├─ budget: Ledger {line_items[], totals_by_category, vs_stated, confidence_bands, tradeoffs[]}
├─ risk: FragileLeg[{leg_ref, probability, cause, plan_b: PlanB}]
├─ pretrip: TimelineItem[] (T-60 book trains, T-45 e-visa…)
└─ packing: PackingList (derived: region × season × activities × party)

Reasoning {summary: string, profile_refs: string[] /* e.g. "taste.anti:crowds" */,
           tradeoffs_considered: string[]}
SourceRef {kind: kb|api|manual, id, last_verified, url?}
```

**Every node ID is stable across versions** → diffing, targeted invalidation, deep links, and optimistic UI all key off node IDs.

### 5.2 Storage

- `plan_graphs` table: `(trip_id, version, graph JSONB, parent_version, diff JSONB, created_at, job_id)`. Full graph per version (graphs are ~100–400KB; storage is cheap, replay is priceless) plus a computed structural diff for the UI.
- Zod schema is the single validator; the DB never stores a graph that fails schema validation.

### 5.3 Mutation engine (`packages/plan-graph`)

Pure functions only: `applyPatch(graph, patch) → graph'`, `diff(a, b) → PlanDiff`, `invalidate(graph, nodeIds) → DirtySet`. Agents emit **patches**, never whole graphs. The engine enforces invariants (days contiguous, legs connect stops, budget references real blocks) before any patch lands.

### 5.4 Targeted revision

`DirtySet` computation: "swap Jaipur→Bundi" dirties that stop's days/blocks/stay/legs touching it, budget, risk, pretrip — but not other stops. The orchestrator re-runs only agents whose ownership intersects the DirtySet (§6.2), then Critic + Constraint re-validation always run on the whole graph (cheap, mostly deterministic).

---

## 6. Backend & Job Architecture

### 6.1 Services (modular monolith, deliberately)

One deployable API + one worker fleet, structured as strict internal packages. **Not microservices** — a small team with AI leverage ships faster on a modular monolith with enforced boundaries (dependency-cruiser rules in CI). The seams (KB service, Integrations gateway) are package boundaries today, extractable services later if scale demands.

### 6.2 Job types (BullMQ queues)

| Queue | Job | Concurrency notes |
|---|---|---|
| `plan.generate` | Full pipeline run | Heavy; per-user rate limit 3/hr; priority lane for paying tiers later |
| `plan.revise` | Targeted revision from DirtySet | Fast lane; <20s p95 target |
| `plan.export` | PDF / .ics / poster generation | Playwright pool |
| `watch.price` | Scheduled fare/hotel checks | Cron-style repeatables |
| `kb.ingest` | Content repo → retrieval layer sync | On merge to `/content` |
| `notify` | Email/WhatsApp dispatch | |

Jobs are **checkpointed**: LangGraph checkpoints persist to Postgres after every node, so a crashed generation resumes from the last completed agent, and any run can be replayed for debugging.

### 6.3 Streaming protocol (SSE)

Channel per job: `GET /api/jobs/:id/events` (resumable with `Last-Event-ID`).

```
event: agent.started     {agent: "route_optimizer", label: "Testing 4 route sequences…"}
event: agent.thought     {agent, summary}            // curated, user-safe status lines only
event: graph.patch       {patch, affected_node_ids}  // UI hydrates incrementally
event: critic.verdict    {pass, issues[]}
event: job.completed     {version}
event: job.failed        {stage, user_message, resumable}
```

The UI renders patches as they arrive → the plan document assembles live in front of the user.

### 6.4 API surface (representative tRPC routers)

```
trip:    create, get, list, fork, share.createLink, share.setPermissions
intake:  parsePrompt, answerClarifier, getNextClarifiers, updateProfileField
plan:    generate, revise(chatMessage | patchIntent), swapBlock, lockNode,
         reorderDays, getVersion, diffVersions, rollback
export:  pdf, ics, poster, whatsappSummary
watch:   create, list, delete
profile: get, upsert, listPersonas
kb:      (internal) search, getEntity
```

Public REST mirrors `trip`/`plan` read paths for share links and future partners, under `/v1` with OpenAPI spec generated from Zod.

---

## 7. Agent Layer (the sophisticated core)

### 7.1 Runtime

LangGraph state machine over typed state:

```ts
interface PipelineState {
  profile: TravellerProfile;        // versioned, provenance-tagged
  graph: PlanGraph;                 // evolving draft
  dirty: DirtySet | "all";
  criticReports: CriticReport[];
  iteration: number;                // critic loop counter, max 3
  budgetSpend: TokenLedger;         // live cost accounting per run
}
```

Graph topology mirrors problemstatement §5.2: `profiler → concept → constraint_gate → route → parallel(stays, experiences, food, logistics) → budget → risk → critic →(fail: targeted_revision loop ≤3)→ constraint_regate → narrator`.

### 7.2 Agent contract (uniform, enforced)

Every agent implements:

```ts
interface Agent<In, Out> {
  name: AgentName;
  ownership: NodeKind[];                     // which graph nodes it may patch
  inputSchema: ZodSchema<In>;                // validated on entry
  outputSchema: ZodSchema<Out>;              // LLM output = structured, schema-validated,
                                             // auto-retried once on validation failure
  tools: ToolDef[];                          // the ONLY way to touch external data
  run(ctx: AgentCtx, input: In): Promise<{patches: GraphPatch[]; telemetry: AgentTelemetry}>;
}
```

- **Ownership is enforced by the mutation engine** — the Stay Curator physically cannot patch a transit leg. This is the multi-agent safety rail.
- **Tools are the grounding boundary.** `kb.search`, `maps.distanceMatrix`, `rail.schedule`, `hotels.search`, `weather.normals`, `festivals.lookup`, `fx.rate`… An agent asserting a fact without a tool-call-derived `SourceRef` gets that node auto-flagged `verify_before_booking` by a post-processor — grounding is *mechanically* enforced, not prompt-requested.

### 7.3 Deterministic constraint layer (`packages/constraints`)

Pure TypeScript validators, zero LLM: season windows (region × month matrix), permit matrix (region × nationality), monument closure calendar, park closure seasons, rail booking-window math, altitude acclimatization rules (no sleeping-altitude gain >500m/day above 3,000m; rest day on Leh arrival), pacing rules (max daily travel hours vs profile), budget arithmetic, date/festival collision detection. Runs as `constraint_gate` (filters concepts) and `constraint_regate` (final validation; a failing plan cannot ship). Each rule returns structured violations that agents receive as machine-readable feedback.

### 7.4 The Critic (quality gate)

- Runs on the full draft with the profile and the acceptance criteria (problemstatement §15) as its rubric; returns `CriticReport {score, issues: [{node_ref, criterion, severity, suggested_fix}]}`.
- **Different model family than the generators** (cross-family critique measurably reduces shared blind spots).
- Issues map to DirtySets → targeted fix loop, max 3 iterations; if still failing on non-blocking criteria, plan ships with internal quality flags (never silently); blocking criteria (hard-constraint violations) can never ship — but those are caught by code in `constraint_regate` anyway.

### 7.5 Prompt management

Prompts are **versioned artifacts in `/packages/agents/prompts`**, rendered from templates with typed slots; every LLM call logs `(prompt_id, prompt_version, model, params)` to Langfuse. Prompt changes go through the eval harness (§14.4) in CI — a prompt PR that drops golden-set critic scores fails the build.

### 7.6 Model routing

| Task class | Tier | **Bootstrap (free-tier) routing** | Examples |
|---|---|---|---|
| Extraction/classification (NL parse, clarifier ranking, edit-intent parsing) | Small/fast | Gemini Flash-Lite (free tier) | prompt→profile, "make day 5 lighter"→patch intent |
| Curation & narrative (Concept, Experience/Food/Stay curation, Narrator) | Frontier | Gemini Flash (free tier; Pro quota for hardest prompts) | the taste layer |
| Critique | Frontier, **different family** | **OpenAI `gpt-5-mini` (reasoning)** funded by existing API credit (~$0.02–0.03/plan; hard $5 usage cap set in dashboard). Eval-suite runs route critique to a free-tier reasoning model (DeepSeek/Llama) to preserve the paid credit for real plans + weekly full-suite + planted-defect calibration | §7.4 |
| Embeddings (KB retrieval) | Embedding model | Gemini embeddings free tier (or local via Ollama) | |

`ModelRouter` holds the policy table behind feature flags → model swaps are config, canary-able per agent, with automatic fallback provider on outage. Per-job token budget enforced; exceeding budget degrades gracefully (fewer alternatives generated) rather than failing.

**Free-tier operating rules (bootstrap):**
- The scarce resource is **requests/day, not dollars**. LLM providers get entries in the per-provider rate-limit ledger (§10.1); the job scheduler throttles `plan.generate` concurrency to remaining quota, and exhausted quota queues jobs with an honest wait estimate rather than failing them.
- Evals run on a **dedicated API key**, scheduled overnight, so eval runs never starve interactive generations.
- Free tiers may use API inputs for product improvement → acceptable for dev/evals (synthetic briefs only); for real-user traffic this is disclosed in the privacy policy until routing moves to zero-retention paid endpoints (§8.3 posture preserved as the scale-phase default).
- The eval harness (§14.4) quantifies the quality gap vs frontier models per agent; upgrading any single agent to a paid model is a one-line routing change, canary-able.
- **The Critic gets the best model available, never weaker than the generators.** It is the last defense for the soft rubric (crowds/pacing/taste — the hard constraints are code anyway) and runs only 1–3 times per plan, so it tolerates paid pricing that generators can't. It is the first slot upgraded whenever budget exists.
- **The Critic reads a condensed rendering of the plan graph** (day summaries, reasoning lines, timing/crowd metadata) — not raw JSONB. Cuts input tokens ~5–10×, fits free-tier TPM limits, and sharpens the critique.
- **The eval LLM-judge (§14.4) stays a third family** distinct from both generators and Critic, so the quality dashboard can catch the Critic's blind spots instead of mirroring them.

### 7.7 Clarifying-question engine (Profiler internals)

1. NL parse → profile fields with confidences.
2. Candidate questions generated from: low-confidence high-impact fields + KB-triggered contingencies (dates hit Diwali → surge question; mountains + December → altitude/closure question).
3. Each candidate scored `information_value × plan_impact` by a small model against a rubric; top 3–8 asked, one at a time, quick-tap first.
4. Post-draft: edit stream (swaps, removals, chat messages) is parsed into profile deltas with provenance `inferred_from_edit`, confirmed lightly in UI.

---

## 8. Data Architecture

### 8.1 Core schema (Drizzle/Postgres, representative)

```
users(id, auth_ids, locale, created_at)
traveller_profiles(id, user_id, label, profile JSONB, version, updated_at)
trips(id, owner_id, status, active_profile_version, title, created_at)
trip_members(trip_id, user_id, role: owner|editor|commenter|viewer)
plan_graphs(trip_id, version, graph JSONB, diff JSONB, parent_version, job_id, critic_score)
jobs(id, type, status, state_checkpoint JSONB, token_ledger JSONB, timings JSONB)
clarifier_log(trip_id, question, options, answer, asked_because, ts)
edits_log(trip_id, kind, payload JSONB, inferred_profile_delta JSONB, ts)
kb_entities(id, kind, slug, data JSONB, last_verified, expires_at, embedding vector)
provider_cache(provider, request_hash, response JSONB, fetched_at, ttl)
price_watches(id, user_id, target JSONB, last_price, threshold, channel)
share_links(trip_id, token, permissions, expires_at)
audit_log(actor, action, entity, ts)
```

### 8.2 Caching policy

| Data | TTL | Where |
|---|---|---|
| Distance-matrix / directions results | 30 days (keyed by od-pair + mode) | `provider_cache` |
| Hotel search results | 6h | Redis |
| Flight fare snapshots | 1h (marked as snapshot in UI) | Redis |
| Rail schedules | 7 days | `provider_cache` |
| Weather normals | 90 days | `provider_cache` |
| KB retrieval results | until KB version bump | Redis |
| Rendered trip document (share links) | until graph version bump | CDN + revalidate tag |

### 8.3 Data lifecycle & privacy

- Profiles = sensitive (health flags, nationality, dates = occupancy signal): field-level encryption for health/passport-adjacent fields; trips auto-archive; hard-delete on request within 30 days (DPDP + GDPR); analytics events pseudonymized; **LLM providers configured for zero data retention**; no training on user data without explicit opt-in.
- Backups: RDS PITR 14 days + daily snapshots 35 days; quarterly restore drills.

---

## 9. India Knowledge Base (owned moat)

### 9.1 Content model

Git repo `/content/kb` — structured YAML per entity, human-reviewed via PRs:

```
/regions/rajasthan.yaml          seasons, road realism, safety notes, clusters
/monuments/taj-mahal.yaml        closures(fri), hours, fees{dom,intl}, dress, photo rules, best_time
/parks/ranthambore.yaml          zones, booking_window, closed(jul–sep), sighting_realism
/festivals/pushkar-mela.yaml     dates_by_year, impact_radius, surge_factor
/permits/arunachal-ilp.yaml      nationalities, channel, fee, lead_time_days
/rail/routes/*.yaml              scenic flags, class guidance, waitlist heuristics
/food/atlas/chettinad.yaml       dishes, venues{local_tier}, notes
/crafts/kutch.yaml               clusters, workshops, ethics notes
/safety/city-notes/*.yaml        arrival-time guidance, area awareness, solo-female notes
```

Every entity: `last_verified`, `verified_by`, `expires_at`, `sources[]`. **Expired entities auto-downgrade**: agents may still use them but nodes get `verify_before_booking`.

### 9.2 Pipeline & retrieval

Merge to main → `kb.ingest` job → validate schemas → chunk + embed (pgvector) → bump KB version (cache-busts). Retrieval = hybrid: structured lookups for deterministic facts (closures, permits — exact, never vector-fuzzy) + semantic search for curation ("weaving workshops near Jaipur worth a half day").

### 9.3 Freshness operations

Weekly verification queue sorted by expiry; a `kb-verifier` internal agent drafts updates from official sources for human approval — human merge remains mandatory. KB coverage dashboard: % entities fresh, per-circuit completeness (MVP: the 12 circuits from problemstatement §13).

---

## 10. Integrations Gateway (`packages/integrations`)

### 10.1 Bootstrap provider tiers (what actually runs at launch)

| Domain | Bootstrap (free) | Scale (paid, later) |
|---|---|---|
| Maps/routing | Google Maps within free credit, heavy memoization | Higher quota |
| Weather | Open-Meteo (free, no key) | — |
| AQI | Open public CPCB data | IQAir |
| FX | Free FX API | — |
| Hotels | **No live API.** KB-curated stays + Google Places details + deep links to Booking/MMT/Agoda search URLs with dates pre-filled | Affiliate APIs with live pricing |
| Flights | **No live API.** Deep links to Google Flights/Skyscanner with route+dates pre-filled; fare guidance from KB seasonal knowledge, labelled as estimates | Amadeus/Kiwi live fares |
| Rail | Static schedule knowledge in KB + booking-window math + deep links to IRCTC/ConfirmTkt | Partner availability APIs |
| Experiences | KB-curated + official-site links | GetYourGuide/Viator affiliate |

This is not a compromise bolted on: the adapter interface is identical, and every "scale" column entry is a drop-in adapter swap behind a flag. Prices shown at bootstrap carry `confidence: estimate` bands (§6.5 of PS) — the output stays honest.

Uniform adapter pattern per provider:

```ts
interface ProviderAdapter<Req, Res> {
  name: string;
  fetch(req: Req): Promise<Res>;        // wrapped: timeout, retry(2, jittered), circuit breaker
  normalize(res: Res): DomainType;      // providers never leak past this boundary
  cachePolicy: CachePolicy;
  healthProbe(): Promise<Health>;
}
```

- **Circuit breakers per provider** (opossum): open circuit → agents receive a typed `ProviderUnavailable` and degrade (e.g., Logistics ships schedule-knowledge + booking guidance with deep links instead of live availability — per problemstatement risk table).
- **Rate-limit ledger** in Redis per provider key; job scheduler respects remaining quota.
- Deep-link builders per provider (IRCTC, airline, OTA, GetYourGuide-style) with dates/party pre-filled; every outbound link tagged for attribution (future affiliate revenue).
- Provider mock server in dev/CI — the full pipeline runs offline deterministically.

---

## 11. AuthN / AuthZ

- Sessions: Auth.js JWT (15min) + rotating refresh; device list in profile.
- Identity: email OTP, Google, phone OTP (MSG91). Progressive: guests can generate 1 plan (server-side anonymous session), account required to save/share — never gate the magic moment behind signup.
- AuthZ: role per trip (`owner/editor/commenter/viewer`) enforced in tRPC middleware; share tokens are scoped capabilities (view or comment, optional expiry); print/PDF routes honor the same checks.
- Admin/KB-editor roles for internal tooling; all admin actions in `audit_log`.

---

## 12. Security

- OWASP ASVS L2 target. Zod validation at every boundary; output encoding by React defaults; CSP strict (nonce-based), no third-party scripts beyond maps/analytics allowlist.
- Secrets in AWS Secrets Manager; no secrets in env files or the monorepo; provider keys scoped least-privilege and rotated quarterly.
- **Prompt-injection defense:** external content (reviews, scraped KB sources, user free text) is wrapped in delimited untrusted-content frames; agents' tool allowlists are per-agent (Experience Curator cannot call notify/export tools); LLM outputs are patches validated against ownership + schema — an injected instruction cannot mutate nodes outside the agent's ownership or invent tool calls.
- Rate limiting: per-IP + per-user on intake/generation; WAF (CloudFront + AWS WAF) on public surface.
- Dependency & container scanning (Renovate + Trivy) in CI; SAST (Semgrep) with a security-review gate on `packages/agents` and `packages/integrations` changes.
- Pen test before public launch; vulnerability disclosure policy page.

---

## 13. Infrastructure & Environments

### 13.0 Bootstrap deployment (CURRENT — build this)

```
Vercel (web: Next.js, free/hobby tier)
   └─ talks to ─► single VPS or Railway/Fly.io instance (docker-compose):
                    api (tRPC/REST) + worker (BullMQ, both queues)
   ├─ Neon Postgres (pgvector, free tier; upgrade = one dashboard click)
   ├─ Upstash Redis (free tier — queue + cache + SSE pub/sub)
   └─ Cloudflare R2 (exports, assets; free tier)
Cost target: $0–20/month. Environments: local (docker-compose) + prod. No staging —
Vercel preview deployments + provider mocks fill that role at this scale.
```

The modular-monolith package structure is unchanged — bootstrap and scale run the *same code*; only the hosting differs. Migration to the scale topology below is a re-deploy, not a rewrite.

### 13.1 Scale topology (FUTURE — activate when revenue/traffic demands)

```
CloudFront (CDN, WAF)
   └─ ALB → ECS Fargate services:
        web (Next.js, 2+ tasks, autoscale on p95 latency)
        api (tRPC/REST, 2+ tasks)
        worker-fast (revisions/exports/notify; autoscale on queue depth)
        worker-heavy (plan.generate; autoscale on queue depth, max concurrency caps LLM spend)
   ├─ RDS Postgres 16 (Multi-AZ) + pgvector
   ├─ ElastiCache Redis (cluster mode)
   └─ S3 (+ lifecycle rules) · SES/Resend · WhatsApp Cloud API
Region: ap-south-1 (Mumbai). DR: cross-region snapshot copies; RTO 4h / RPO 15min (PITR).
```

- Environments: `dev` (local docker-compose incl. provider mocks), `staging` (full stack, synthetic KB), `prod`.
- CI/CD: PR → typecheck, lint, unit, dependency-cruiser boundaries, axe, Lighthouse budgets, **eval harness on agent/prompt changes** → merge → staging deploy + smoke (golden brief generates end-to-end) → manual gate → prod (rolling); DB migrations expand-contract, never breaking.
- Feature flags (Unleash) gate: new agents, model routings, question strategies, UI experiments.

---

## 14. Observability & Quality

### 14.1 Tracing
OTel end-to-end: one trace per plan job; spans per agent, per tool call, per provider call, per graph patch. Trace ID surfaces in admin UI on every trip version → any plan is replayable and explainable internally.

### 14.2 LLM observability
Langfuse: every call logs prompt version, model, tokens, latency, cost, validation retries. Dashboards: cost per plan (target < $0.60 MVP), cost per revision (< $0.10), validation-failure rate per agent, critic pass rate on first iteration.

### 14.3 Product SLOs
| SLO | Target |
|---|---|
| First SSE event after submit | < 5s p95 |
| Full plan generation | < 90s p95 |
| Targeted revision | < 20s p95 |
| API availability | 99.9% monthly |
| Factual spot-check pass rate (weekly human audit of 20 plans) | > 98%, alert < 95% |

### 14.4 Evaluation harness (`/evals`) — the quality flywheel
- **Golden set:** 100+ briefs spanning personas × regions × seasons × edge cases (Diwali dates, Ladakh in January, wheelchair user, ₹15k shoestring, wedding anchor).
- Each run scored by: deterministic checks (constraint violations = automatic fail, budget math, link validity) + LLM-judge rubric (personalisation traceability, taste quality, reasoning quality — problemstatement §15 criteria) + periodic human expert ratings that calibrate the judge.
- Runs on every agent/prompt/model PR; score regression fails CI. Nightly full-suite run charts quality over time.
- Production feedback loop: user edit-depth, plan ratings, and post-trip feedback flow into a review queue that seeds new golden briefs.

---

## 15. Internationalization

- `next-intl`; all strings externalized from day one including agent-generated UI framing.
- **Narrator generates in the target language natively** (not translate-after) — reasoning voice quality in Hindi is a launch requirement, other Indic languages phased.
- Locale-aware currency/number/date (lakh/crore formatting for INR), IST-anchored date logic throughout (`/packages/shared/dates`).

---

## 16. Testing Strategy

| Layer | Approach |
|---|---|
| `plan-graph` engine | Exhaustive unit + property-based tests (fast-check): patch/diff/invalidate invariants — highest-value tests in the repo |
| `constraints` | Table-driven tests against the KB matrices; every rule has failing + passing fixtures |
| Agents | Contract tests with mocked tools + recorded LLM cassettes for deterministic CI; schema-validation fuzzing |
| Integrations | Adapter tests against provider mocks + nightly live smoke (flagged keys) |
| API | tRPC integration tests on ephemeral Postgres (testcontainers) |
| UI | Playwright E2E on the 5 golden flows (prompt→plan, clarify, swap, revise-via-chat, export/share); visual regression (Chromatic-style) on the design system |
| Pipeline | Full offline end-to-end: golden brief → mocked providers → complete plan graph → asserted against expectations |
| Load | k6: 100 concurrent generations sustained; SSE fan-out; queue backpressure behavior |

---

## 17. Analytics & Experimentation

- Event schema (typed, versioned): `prompt_submitted, echo_edited, clarifier_answered/skipped, plan_generated, block_swapped, revision_requested, assumption_changed, exported, shared, booking_link_clicked, trip_downloaded_offline`.
- Self-hostable analytics (PostHog) — India data residency.
- Experiments via Unleash: clarifier count strategies, reasoning verbosity defaults, concept-count (2 vs 3), model routings. North-star proxy funnel (per problemstatement §12) is a first-class dashboard.

---

## 18. Cost Model & Controls

| Lever | Control |
|---|---|
| LLM spend | Per-job token budgets; model routing; cached sub-plans (popular circuit skeletons pre-warmed); targeted revisions; small-model-first policy |
| Provider APIs | Cache policies (§8.2); distance-matrix memoization is the big one; quotas per env |
| Infra | Fargate autoscaling with hard max on worker-heavy; S3 lifecycle; CDN offload of trip docs |
| Guardrail | Per-user generation rate limits; anonymous users 1 plan; cost anomaly alerts (spend per plan > 2× baseline pages on-call) |

---

## 19. Scalability Path

Designed-in seams, exercised only when needed: extract `worker-heavy` fleet independently (already separate queue); extract Integrations gateway to its own service if provider fan-out grows; read replicas for trip-document reads; plan-graph reads via CDN for share traffic; KB to a dedicated search service (currently pgvector suffices to ~10M chunks); multi-region active-passive if international traffic warrants. Nothing requires re-architecture — the modular monolith's package boundaries are the future service boundaries.

---

## 20. Architecture Decision Records (initial set)

| ADR | Decision | Key alternative rejected |
|---|---|---|
| 001 | TypeScript end-to-end | Python backend (better ML ecosystem; rejected: type-safety seam UI↔agents is worth more here) |
| 002 | Modular monolith on ECS | Microservices (premature), serverless-only (cold starts + 90s jobs fit poorly) |
| 003 | LangGraph behind own `AgentRuntime` | Hand-rolled orchestrator (more control, more code); framework lock-in mitigated by wrapper |
| 004 | Plan graph as JSONB versions | Normalized relational plan model (query-friendly but mutation/diff engine becomes SQL soup) |
| 005 | SSE over WebSockets | WS (bidirectional not needed; SSE survives Indian mobile networks better, resumable) |
| 006 | Google Maps Platform | Mapbox/OSM (cost lower, India POI coverage decisively worse) |
| 007 | Playwright print-to-PDF | PDF libs (duplicate layout logic; one render pipeline wins) |
| 008 | Critic on different model family | Same-family critique (cheaper, shared blind spots) |
| 009 | KB as git-reviewed YAML | Admin-CMS database (faster edits, weaker review/versioning; revisit at scale) |
| 010 | AWS ap-south-1 as the *scale* topology | Vercel-only (simpler, but worker fleet + data residency + cost at scale favor AWS; Next.js still deployable to Vercel in front if desired) |
| 011 | **Bootstrap-first hosting** (Vercel + VPS + Neon + Upstash + R2, $0–20/mo) with identical codebase | Building the AWS topology day one (rejected: solo hobbyist budget; premature ops burden; nothing in the code changes between the two) |
| 012 | **Deep-link-first provider strategy** — booking links + KB knowledge instead of paid live-availability APIs at bootstrap (see §10.1) | Paid APIs day one (rejected: Amadeus/hotel affiliate programs cost money and/or require approved businesses; degradation paths were already designed, so bootstrap simply makes them the default) |
| 013 | **Free-tier-first LLM routing** (Gemini free tier for extraction + curation; the one paid exception is the Critic on OpenAI `gpt-5-mini` within an existing $5 credit, §7.6) — LLM cash spend at bootstrap ≈ $0; rate-limit ledger governs daily quotas | Paid frontier models day one (rejected: no cash budget; ModelRouter makes the upgrade a config flip per agent; eval harness measures the quality gap so the upgrade decision is data-driven, not guessed) |
| 014 | **Critic-first upgrade policy** — the Critic is always the strongest different-family model affordable (currently gpt-5-mini), evals judge on a third family, critic input is a condensed graph rendering | Spending the first budget on generator upgrades (rejected: generators make many calls per plan vs the Critic's 1–3; a strong critic raises the floor of every plan and partially compensates for weak generators via the fix loop) |

---

## 21. Build Order (for the Antigravity workflow)

1. **Foundations:** monorepo, design tokens + core UI primitives, DB schema, auth, CI gates.
2. **Plan graph engine + constraints package** with full test suites (everything depends on these being right).
3. **KB v1** (2 circuits deep — Rajasthan, Kerala) + retrieval.
4. **Agent runtime + Profiler + Concept + Constraint gate** → first end-to-end skeleton plan on mocked providers.
5. **Route + Logistics + Stays + Experiences + Food + Budget + Risk** agents iteratively, each landing with eval-harness briefs.
6. **Critic + Narrator + streaming UI** → the full magic loop.
7. **Revision loop + diff UI + exports + share.**
8. Provider adapters live one-by-one behind flags (maps first, then hotels, rail, flights).
9. Hardening: load tests, pen test, offline PWA, Hindi output, observability dashboards.

Each step ships something runnable; the eval harness runs from step 4 onward so quality is measured from the first end-to-end plan, not after launch.

---

*End of architecture document.*
