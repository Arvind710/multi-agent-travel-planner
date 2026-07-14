# Infra — bootstrap topology (ARCH §13.0)

No IaC at bootstrap (ADR: Terraform deferred to scale phase). Everything is
dashboard-configured and documented here as it is set up.

| Component | Provider | Status | Notes |
| --- | --- | --- | --- |
| Web | Vercel (hobby) | not yet | connect repo, root `apps/web` |
| API + worker | Railway free month → Oracle Cloud Always Free ARM VM | not yet | single box, docker-compose; deploy from P7 only |
| Postgres + pgvector | Neon (free tier) | not yet | |
| Redis | Upstash (free tier) | not yet | queue + cache + SSE pub/sub |
| Object storage | Cloudflare R2 (free tier) | not yet | exports, assets |
| LLMs | Gemini free tier + Groq/Mistral free tier + OpenAI $5 credit (Critic only, hard cap set) | not yet | ARCH §7.6 / ADR-013/014 |

Local dev: `docker-compose.dev.yml` (Postgres 16 + pgvector, Redis 7, MinIO).
