"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface EventRow {
  seq: number;
  type: string;
  detail: string;
}

/**
 * P0 exit-gate page: proves prompt-to-plan plumbing before any agent exists.
 * Enqueue → BullMQ → worker heartbeats → Redis log/pubsub → resumable SSE → UI.
 * (Plain fetch to the tRPC HTTP endpoint; the typed tRPC client arrives in P3.10.)
 */
export default function SseDevPage() {
  const t = useTranslations("dev");
  const [rows, setRows] = useState<EventRow[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const sourceRef = useRef<EventSource | null>(null);

  async function start() {
    setRows([]);
    setState("running");
    try {
      const res = await fetch(`${API_URL}/trpc/dev.enqueueHeartbeat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const body = (await res.json()) as { result: { data: { jobId: string } } };
      const id = body.result.data.jobId;
      setJobId(id);

      sourceRef.current?.close();
      const source = new EventSource(`${API_URL}/api/jobs/${id}/events`);
      sourceRef.current = source;

      const onEvent = (e: MessageEvent) => {
        const envelope = JSON.parse(e.data as string) as {
          seq: number;
          event: { type: string; message?: string };
        };
        setRows((prev) => [
          ...prev,
          {
            seq: envelope.seq,
            type: envelope.event.type,
            detail: envelope.event.message ?? "",
          },
        ]);
        if (envelope.event.type === "job.completed") {
          setState("done");
          source.close();
        }
      };
      source.addEventListener("job.heartbeat", onEvent);
      source.addEventListener("job.completed", onEvent);
      source.addEventListener("job.failed", onEvent);
      source.onerror = () => {
        if (state !== "done") setState("error");
        source.close();
      };
    } catch {
      setState("error");
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="font-[family-name:var(--font-display)] text-[length:var(--text-xl)]">
        {t("sseTitle")}
      </h1>
      <p className="mt-2 text-ink-muted">{t("sseIntro")}</p>
      <button
        onClick={() => void start()}
        disabled={state === "running"}
        className="mt-4 rounded-md border border-border-strong bg-surface-raised px-4 py-2 hover:border-accent disabled:opacity-50"
      >
        {state === "running" ? t("running") : t("start")}
      </button>
      {jobId && <p className="mt-3 font-[family-name:var(--font-mono)] text-xs">job: {jobId}</p>}
      {state === "error" && <p className="mt-3 text-danger">{t("error")}</p>}
      <ol className="mt-4 space-y-1 font-[family-name:var(--font-mono)] text-sm">
        {rows.map((r) => (
          <li key={r.seq}>
            <span className="text-ink-faint">#{r.seq}</span>{" "}
            <span className={r.type === "job.completed" ? "text-success" : "text-secondary"}>
              {r.type}
            </span>{" "}
            {r.detail}
          </li>
        ))}
      </ol>
    </main>
  );
}
