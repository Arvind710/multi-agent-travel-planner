import { loadEnv } from "@raah/shared/env";

/** The 6 queues of ARCH §6.2. Names are shared with the api's enqueue side. */
export const QUEUE = {
  planGenerate: "plan.generate",
  planRevise: "plan.revise",
  planExport: "plan.export",
  watchPrice: "watch.price",
  kbIngest: "kb.ingest",
  notify: "notify",
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export function queueConcurrency(): Record<QueueName, number> {
  const env = loadEnv();
  return {
    [QUEUE.planGenerate]: env.PLAN_GENERATE_CONCURRENCY,
    [QUEUE.planRevise]: env.PLAN_REVISE_CONCURRENCY,
    [QUEUE.planExport]: env.PLAN_EXPORT_CONCURRENCY,
    [QUEUE.watchPrice]: env.WATCH_PRICE_CONCURRENCY,
    [QUEUE.kbIngest]: env.KB_INGEST_CONCURRENCY,
    [QUEUE.notify]: env.NOTIFY_CONCURRENCY,
  };
}
