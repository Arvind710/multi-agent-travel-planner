import { describe, expect, it } from "vitest";
import {
  JobEvent,
  JobEventEnvelope,
  jobEventsChannel,
  jobEventsLogKey,
  publishJobEvent,
  type JobEventRedis,
} from "./events";

function fakeRedis() {
  const lists = new Map<string, string[]>();
  const counters = new Map<string, number>();
  const published: { channel: string; message: string }[] = [];
  const redis: JobEventRedis = {
    async incr(key) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
    async rpush(key, value) {
      const list = lists.get(key) ?? [];
      list.push(value);
      lists.set(key, list);
      return list.length;
    },
    async expire() {
      return 1;
    },
    async publish(channel, message) {
      published.push({ channel, message });
      return 1;
    },
  };
  return { redis, lists, published };
}

describe("job events protocol", () => {
  it("validates known event shapes and rejects unknown types", () => {
    expect(JobEvent.parse({ type: "job.heartbeat", message: "hi" }).type).toBe("job.heartbeat");
    expect(() => JobEvent.parse({ type: "job.exploded" })).toThrow();
  });

  it("publishJobEvent assigns monotonic seq, stores, and publishes", async () => {
    const { redis, lists, published } = fakeRedis();
    const e1 = await publishJobEvent(redis, "j1", { type: "job.heartbeat", message: "1" });
    const e2 = await publishJobEvent(redis, "j1", { type: "job.completed" });
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);

    const log = lists.get(jobEventsLogKey("j1"));
    expect(log).toHaveLength(2);
    expect(JobEventEnvelope.parse(JSON.parse(log![1]!)).event.type).toBe("job.completed");

    expect(published.map((p) => p.channel)).toEqual([
      jobEventsChannel("j1"),
      jobEventsChannel("j1"),
    ]);
  });

  it("keeps independent sequences per job", async () => {
    const { redis } = fakeRedis();
    await publishJobEvent(redis, "a", { type: "job.heartbeat", message: "x" });
    const b = await publishJobEvent(redis, "b", { type: "job.heartbeat", message: "y" });
    expect(b.seq).toBe(1);
  });
});
