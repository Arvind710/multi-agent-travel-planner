import { setTimeout as sleep } from "node:timers/promises";
import { Worker, type Processor } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "@raah/shared/env";
import { publishJobEvent } from "@raah/shared/events";
import { logger } from "./logger.js";
import { QUEUE, queueConcurrency, type QueueName } from "./queues.js";

const env = loadEnv();

/** BullMQ requires maxRetriesPerRequest: null on its blocking connection. */
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
/** Separate connection for event publishing (never blocked by BullMQ). */
const events = new Redis(env.REDIS_URL);

connection.on("error", (e) => logger.warn({ err: e.message }, "redis (bullmq) error"));
events.on("error", (e) => logger.warn({ err: e.message }, "redis (events) error"));

/**
 * No-op plan.generate processor (P0.7): emits SSE heartbeats so the whole
 * queue→events→SSE→UI pipeline is provable before any agent exists.
 * Replaced by the real LangGraph pipeline in P3.
 */
const planGenerateProcessor: Processor = async (job) => {
  const jobId = String(job.id);
  logger.info({ jobId }, "plan.generate heartbeat job started");
  for (let i = 1; i <= 8; i++) {
    await publishJobEvent(events, jobId, {
      type: "job.heartbeat",
      message: `heartbeat ${i}/8 — pipeline plumbing OK`,
    });
    await sleep(1000);
  }
  await publishJobEvent(events, jobId, { type: "job.completed" });
  logger.info({ jobId }, "plan.generate heartbeat job completed");
};

const noopProcessor =
  (queue: QueueName): Processor =>
  async (job) => {
    logger.info({ queue, jobId: job.id }, "no-op processor (implemented in a later phase)");
  };

const processors: Record<QueueName, Processor> = {
  [QUEUE.planGenerate]: planGenerateProcessor,
  [QUEUE.planRevise]: noopProcessor(QUEUE.planRevise),
  [QUEUE.planExport]: noopProcessor(QUEUE.planExport),
  [QUEUE.watchPrice]: noopProcessor(QUEUE.watchPrice),
  [QUEUE.kbIngest]: noopProcessor(QUEUE.kbIngest),
  [QUEUE.notify]: noopProcessor(QUEUE.notify),
};

const concurrency = queueConcurrency();
const workers = (Object.keys(processors) as QueueName[]).map(
  (name) =>
    new Worker(name, processors[name], {
      connection,
      concurrency: concurrency[name],
    }),
);

for (const w of workers) {
  w.on("failed", (job, err) => logger.error({ queue: w.name, jobId: job?.id, err }, "job failed"));
  w.on("ready", () => logger.info({ queue: w.name }, "worker ready"));
}

logger.info({ queues: workers.map((w) => w.name) }, "worker fleet booted");

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "graceful shutdown: closing workers");
    void Promise.all(workers.map((w) => w.close()))
      .then(() => Promise.all([connection.quit(), events.quit()]))
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}
