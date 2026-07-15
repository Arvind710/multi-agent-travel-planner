# Incident Response Runbooks

## 1. Provider Outage (Google Maps, Open-Meteo)
- **Symptom**: Circuit breakers open; High error rate alerts from Opossum.
- **Action**: 
  - Ensure `ProviderAdapter` fallbacks are engaged. 
  - If Google Maps is fully down, users will see static stubs for maps and distances.
  - Announce degraded performance if core routing is impacted.

## 2. Model Outage / Fallback (LLM API)
- **Symptom**: 5xx from AI provider, or high latency >30s for stream start.
- **Action**:
  - `ModelAdapter` automatically fails over to secondary provider (e.g. Llama 3 -> Groq / OpenAI).
  - Verify API keys and quota on the secondary provider.

## 3. Queue Saturation (Worker Overload)
- **Symptom**: Backpressure on BullMQ; latency for graph generation >1m.
- **Action**:
  - Check active trip count.
  - Increase worker concurrency or horizontally scale `apps/worker` via orchestration.
  - Verify Redis is not memory-capped.
