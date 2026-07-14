# Infra — bootstrap topology (ARCH §13.0)

No IaC at bootstrap (ADR: Terraform deferred to scale phase). Everything is
dashboard-configured and documented here as it is set up.

| Component           | Provider                                                                                 | Status  | Notes                                           |
| ------------------- | ---------------------------------------------------------------------------------------- | ------- | ----------------------------------------------- |
| Web                 | Vercel (hobby)                                                                           | not yet | connect repo, root `apps/web`                   |
| API + worker        | Railway free month → Oracle Cloud Always Free ARM VM                                     | not yet | single box, docker-compose; deploy from P7 only |
| Postgres + pgvector | Neon (free tier)                                                                         | not yet |                                                 |
| Redis               | Upstash (free tier)                                                                      | not yet | queue + cache + SSE pub/sub                     |
| Object storage      | Cloudflare R2 (free tier)                                                                | not yet | exports, assets                                 |
| LLMs                | Gemini free tier + Groq/Mistral free tier + OpenAI $5 credit (Critic only, hard cap set) | not yet | ARCH §7.6 / ADR-013/014                         |

Local dev: `docker-compose.dev.yml` (Postgres 16 + pgvector, Redis 7, MinIO).

## CI (P0.13)

GitHub Actions on every PR/push to main:

1. **quality** — prettier check, ESLint (incl. fetch/luxon bans), dependency-cruiser
   boundaries (`no-llm-in-deterministic`, `no-fetch-outside-integrations`,
   `no-cross-app-imports`), turbo typecheck + tests (testcontainers db test runs
   on the Docker-enabled runner).
2. **migrations** — fresh pgvector Postgres service: apply all migrations + seed.
   A migration that can't apply to a clean DB blocks merge.
3. **web** — `next build` + Lighthouse CI: a11y ≥ 0.95 (axe-core under the hood,
   hard gate), perf ≥ 0.9 (warn until real pages exist), landing JS ≤ 150 KB (hard).

## Deploy procedure (activated in P7 — private beta)

- **web** → Vercel Git integration (project root `apps/web`), previews per PR act as staging.
- **api+worker** → single VPS/Railway: `docker compose pull && docker compose up -d`
  (compose file to be added in P7 when the host exists). Runtime is tsx over the
  monorepo — same code as dev, no separate build artifact at bootstrap.
- **db** → `pnpm db:migrate` against Neon before rolling api/worker (expand-contract).
