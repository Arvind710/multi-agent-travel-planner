import { z } from "zod";

/**
 * Typed SSE event protocol for plan jobs (ARCH §6.3).
 * Worker publishes; api replays + streams; web renders. One schema, three consumers.
 */
export const JobEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("job.heartbeat"), message: z.string() }),
  z.object({ type: z.literal("agent.started"), agent: z.string(), label: z.string() }),
  /** Curated, user-safe status lines only — never raw chain-of-thought. */
  z.object({ type: z.literal("agent.thought"), agent: z.string(), summary: z.string() }),
  z.object({
    type: z.literal("graph.patch"),
    patch: z.unknown(),
    affectedNodeIds: z.array(z.string()),
  }),
  z.object({
    type: z.literal("critic.verdict"),
    pass: z.boolean(),
    issues: z.array(z.unknown()),
  }),
  z.object({ type: z.literal("job.completed"), version: z.number().int().optional() }),
  z.object({
    type: z.literal("job.failed"),
    stage: z.string(),
    userMessage: z.string(),
    resumable: z.boolean(),
  }),
]);
export type JobEvent = z.infer<typeof JobEvent>;

/** Stored/published wrapper; `seq` doubles as the SSE event id for Last-Event-ID resume. */
export const JobEventEnvelope = z.object({
  jobId: z.string(),
  seq: z.number().int().positive(),
  ts: z.number(),
  event: JobEvent,
});
export type JobEventEnvelope = z.infer<typeof JobEventEnvelope>;

export const jobEventsChannel = (jobId: string): string => `job:${jobId}:events`;
export const jobEventsLogKey = (jobId: string): string => `job:${jobId}:eventlog`;
export const jobEventsSeqKey = (jobId: string): string => `job:${jobId}:seq`;
export const JOB_EVENTS_TTL_SECONDS = 24 * 60 * 60;

/** Structural Redis interface so this package needs no ioredis dependency. */
export interface JobEventRedis {
  incr(key: string): Promise<number>;
  rpush(key: string, value: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  publish(channel: string, message: string): Promise<number>;
}

/** Append to the durable event log (replayable) and fan out via pub/sub (live). */
export async function publishJobEvent(
  redis: JobEventRedis,
  jobId: string,
  event: JobEvent,
): Promise<JobEventEnvelope> {
  const seq = await redis.incr(jobEventsSeqKey(jobId));
  const envelope: JobEventEnvelope = { jobId, seq, ts: Date.now(), event };
  const json = JSON.stringify(envelope);
  await redis.rpush(jobEventsLogKey(jobId), json);
  await redis.expire(jobEventsLogKey(jobId), JOB_EVENTS_TTL_SECONDS);
  await redis.expire(jobEventsSeqKey(jobId), JOB_EVENTS_TTL_SECONDS);
  await redis.publish(jobEventsChannel(jobId), json);
  return envelope;
}
