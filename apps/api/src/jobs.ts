import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { ulid } from "ulid";
import { loadEnv } from "@raah/shared/env";
import { injectTraceContext } from "@raah/shared/telemetry";

const env = loadEnv();

/** Enqueue-side BullMQ connection (separate from the api's cache/pubsub client). */
const queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
queueConnection.on("error", () => {});

const queues = new Map<string, Queue>();

function queue(name: string): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: queueConnection });
    queues.set(name, q);
  }
  return q;
}

/** Enqueue a plan.generate job; returns the job id the SSE channel is keyed by. */
export async function enqueuePlanGenerate(payload: Record<string, unknown>): Promise<string> {
  const jobId = ulid();
  await queue("plan.generate").add("generate", injectTraceContext(payload), { jobId });
  return jobId;
}
