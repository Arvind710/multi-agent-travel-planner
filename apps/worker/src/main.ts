import { initOtel } from "./otel";
import { initSentry } from "./sentry";

initOtel("raah-worker");
initSentry();

import { setTimeout as sleep } from "node:timers/promises";
import { context as otelContext, trace } from "@opentelemetry/api";
import { Worker, type Processor } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "@raah/shared/env";
import { createDb, upsertKbEntity } from "@raah/db";
import { ingest, validateContent } from "@raah/kb";
import { fileURLToPath } from "node:url";
import { publishJobEvent } from "@raah/shared/events";
import { extractTraceContext } from "@raah/shared/telemetry";
import { logger } from "./logger";
import { QUEUE, queueConcurrency, type QueueName } from "./queues";
import { processPlanGenerateJob } from "./jobs/plan-generate";

/** Repo-root content dir — cwd under turbo is apps/worker, so anchor to this file. */
const CONTENT_ROOT = fileURLToPath(new URL("../../../content/kb", import.meta.url));

const tracer = trace.getTracer("raah-worker");

const env = loadEnv();

/** BullMQ requires maxRetriesPerRequest: null on its blocking connection. */
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
/** Separate connection for event publishing (never blocked by BullMQ). */
const events = new Redis(env.REDIS_URL);
const { db, pool } = createDb(env.DATABASE_URL);

connection.on("error", (e) => logger.warn({ err: e.message }, "redis (bullmq) error"));
events.on("error", (e) => logger.warn({ err: e.message }, "redis (events) error"));

/**
 * plan.generate: the real KB-grounded pipeline (P3.9). The P0.7 heartbeat
 * path stays behind `kind: "heartbeat-smoke"` — it proves queue→SSE plumbing
 * without an LLM key and backs the P0 exit-gate helper.
 */
const planGenerateProcessor: Processor = async (job) => {
  const jobId = String(job.id);
  // Continue the trace started at enqueue time (ARCH §14.1: one trace per plan job).
  const parent = extractTraceContext(job.data as Record<string, unknown>);
  await otelContext.with(parent, () =>
    tracer.startActiveSpan("plan.generate", async (span) => {
      try {
        if ((job.data as { kind?: string }).kind === "plan-generate") {
          logger.info({ jobId }, "plan.generate pipeline job started");
          await processPlanGenerateJob({
            job,
            db,
            contentRoot: CONTENT_ROOT,
            publish: (event) => publishJobEvent(events, jobId, event),
          });
          logger.info({ jobId }, "plan.generate pipeline job finished");
          return;
        }
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
      } finally {
        span.end();
      }
    }),
  );
};

const noopProcessor =
  (queue: QueueName): Processor =>
  async (job) => {
    logger.info({ queue, jobId: job.id }, "no-op processor (implemented in a later phase)");
  };

/** P2.6: validate → idempotently upsert → update the Redis retrieval version. */
const kbIngestProcessor: Processor = async () => {
  const content = await validateContent(CONTENT_ROOT);
  if (content.issues.length)
    throw new Error(
      `KB validation failed: ${content.issues.map((i) => `${i.file}: ${i.message}`).join(" | ")}`,
    );
  const report = await ingest(content.entities, {
    upsert: (record) => upsertKbEntity(db, { ...record, kbVersion: 0 }),
    bumpVersion: async () => Number(await events.incr("kb:version")),
  });
  logger.info(report, "kb.ingest completed");
};

const processors: Record<QueueName, Processor> = {
  [QUEUE.planGenerate]: planGenerateProcessor,
  [QUEUE.planRevise]: noopProcessor(QUEUE.planRevise),
  [QUEUE.planExport]: noopProcessor(QUEUE.planExport),
  [QUEUE.watchPrice]: noopProcessor(QUEUE.watchPrice),
  [QUEUE.kbIngest]: kbIngestProcessor,
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
      .then(() => Promise.all([connection.quit(), events.quit(), pool.end()]))
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}
