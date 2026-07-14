import type { FastifyPluginAsync } from "fastify";
import {
  JobEventEnvelope,
  jobEventsChannel,
  jobEventsLogKey,
} from "@raah/shared/events";
import { loadEnv } from "@raah/shared/env";
import { createSubscriber, redis } from "./redis";

const env = loadEnv();

/**
 * GET /api/jobs/:id/events — resumable SSE per ARCH §6.3.
 * Resume order matters: subscribe FIRST (buffering live events), then replay the
 * durable log, then flush the buffer — seq-deduped so nothing is lost or doubled
 * even when events arrive during replay.
 */
export const sseRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string }; Querystring: { lastEventId?: string } }>(
    "/api/jobs/:id/events",
    async (req, reply) => {
      const jobId = req.params.id;
      const lastSeen =
        Number(req.headers["last-event-id"] ?? req.query.lastEventId ?? 0) || 0;

      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        "access-control-allow-origin": env.WEB_URL,
        "access-control-allow-credentials": "true",
      });
      res.write(": connected\n\n");

      let lastSent = lastSeen;
      const send = (envelope: JobEventEnvelope): void => {
        if (envelope.seq <= lastSent) return;
        lastSent = envelope.seq;
        res.write(
          `id: ${envelope.seq}\nevent: ${envelope.event.type}\ndata: ${JSON.stringify(envelope)}\n\n`,
        );
      };
      const parse = (json: string): JobEventEnvelope | null => {
        const parsed = JobEventEnvelope.safeParse(JSON.parse(json));
        return parsed.success ? parsed.data : null;
      };

      const sub = createSubscriber();
      const liveBuffer: JobEventEnvelope[] = [];
      let replayDone = false;

      sub.on("message", (_channel: string, message: string) => {
        const envelope = parse(message);
        if (!envelope) return;
        if (replayDone) send(envelope);
        else liveBuffer.push(envelope);
      });

      try {
        await sub.subscribe(jobEventsChannel(jobId));
        const log = await redis.lrange(jobEventsLogKey(jobId), 0, -1);
        for (const entry of log) {
          const envelope = parse(entry);
          if (envelope) send(envelope);
        }
      } catch (e) {
        req.log.warn({ err: e, jobId }, "sse: redis unavailable during replay");
      }
      replayDone = true;
      for (const envelope of liveBuffer) send(envelope);

      const keepalive = setInterval(() => res.write(": keepalive\n\n"), 15_000);

      req.raw.on("close", () => {
        clearInterval(keepalive);
        void sub.quit().catch(() => {});
      });
    },
  );
};
