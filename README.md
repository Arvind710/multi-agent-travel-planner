# Raah — AI-Powered Multi-Agent Travel Planner for India

A traveller describes their trip in natural language; a cooperating system of specialised AI
agents produces a deeply personalised, fully reasoned, logistics-complete itinerary for travel
anywhere in India — refinable through conversation.

**Docs are the contract:**

- `Docs/problemstatement.md` — WHAT (product spec)
- `Docs/architecture.md` — HOW (technical architecture)
- `Docs/implementation-plan.md` — WHEN / IN WHAT ORDER (phases P0–P8)

## Monorepo layout (ARCH §2)

```
/apps
  /web            → Next.js app (UI, print routes, PWA)
  /api            → tRPC + REST gateway (thin; delegates to packages)
  /worker         → BullMQ consumers: plan jobs, revisions, exports, price-watch, KB ingestion
/packages
  /agents         → agent definitions, prompts, LangGraph graphs, ModelRouter
  /plan-graph     → canonical PlanGraph types, Zod schemas, mutation + diff engine
  /kb             → India KB: content loaders, retrieval, verification tooling
  /integrations   → provider adapters (maps, weather, aqi, fx, rail, hotels, flights…)
  /constraints    → deterministic validators (seasons, permits, budget math, pacing)
  /db             → Drizzle schema + migrations
  /ui             → design system "Raah" (tokens, primitives, plan components)
  /shared         → env, dates (Luxon, IST), money, result, events, flags
/content/kb       → versioned YAML knowledge entities (git-reviewed)
/tools/provider-mocks → deterministic provider fixtures for dev/CI
/evals            → golden briefs + plan-quality eval harness
/infra            → deployment notes (bootstrap: dashboard-configured, documented)
```

## Getting started

```sh
corepack enable pnpm
pnpm install
pnpm dev        # boots docker infra (Postgres+pgvector, Redis, MinIO) + all apps
```

Requires Node ≥22 and Docker (Docker Desktop or OrbStack) for local Postgres/Redis.
Copy `.env.example` to `.env` and fill in what you have; everything has dev defaults
except real provider keys.

## Deterministic-package rule (never violated)

`packages/constraints`, `packages/plan-graph`, `packages/db` contain **zero LLM calls** —
enforced by dependency-cruiser rule `no-llm-in-deterministic` in CI.
All external HTTP goes through `packages/integrations` adapters only.
