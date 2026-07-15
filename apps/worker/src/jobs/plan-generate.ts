import type { Job } from "bullmq";
import { TravellerProfile } from "@raah/shared/profile";
import type { JobEvent } from "@raah/shared/events";
import { safeParsePlanGraph, type PlanGraph } from "@raah/plan-graph";
import { savePlanGraphVersion, setTripStatus, type Db } from "@raah/db";
import { buildPipeline, llmConfigured, type PipelineState } from "@raah/agents";
import { KnowledgeBase } from "@raah/kb";

type Publish = (event: JobEvent) => Promise<unknown>;

/** User-safe status lines per pipeline node (never raw chain-of-thought). */
const AGENT_LABELS: Record<string, string> = {
  architect: "Designed the trip concept",
  constraintGate: "Checked hard constraints (seasons, permits, closures)",
  routeOptimizer: "Laid out the route and transit legs",
  logistics: "Worked out booking details for each leg",
  stayCurator: "Curated stays",
  experienceCurator: "Curated day-by-day experiences",
  foodCurator: "Curated food and dining",
  budgetReconciler: "Reconciled the budget ledger",
  riskAgent: "Stress-tested fragile legs",
  pretripGenerator: "Built the pre-trip checklist",
  critic: "Critiqued the full plan",
  narrator: "Wrote the trip narrative",
  constraintReGate: "Final constraint validation",
};

/**
 * P3.9 (v0): the real plan.generate — KB-grounded LangGraph pipeline,
 * SSE progress per node, validated PlanGraph persisted per trip.
 * Still to come: Postgres checkpointing + token ledger (P3.1), resumability.
 */
export async function processPlanGenerateJob(opts: {
  job: Job;
  db: Db;
  contentRoot: string;
  publish: Publish;
}): Promise<void> {
  const { job, db, contentRoot, publish } = opts;
  const jobId = String(job.id);
  const data = job.data as { profile?: unknown; tripId?: unknown };
  const tripId = typeof data.tripId === "string" ? data.tripId : undefined;

  if (!llmConfigured()) {
    await publish({
      type: "job.failed",
      stage: "boot",
      userMessage:
        "Plan generation is not configured yet (missing Gemini API key). Ask the operator to set GEMINI_API_KEY.",
      resumable: false,
    });
    if (tripId) await setTripStatus(db, tripId, "draft").catch(() => undefined);
    throw new Error("GEMINI_API_KEY not set — cannot run the agent pipeline");
  }

  const profile = TravellerProfile.parse(data.profile);
  const kb = await KnowledgeBase.fromContent(contentRoot);
  const pipeline = buildPipeline({ kb });
  const config = { configurable: { thread_id: jobId } };

  const initialState: PipelineState = {
    profile,
    graph: undefined as unknown as PipelineState["graph"],
    dirty: "all",
    criticReports: [],
    iteration: 0,
    budgetSpend: { spent: 0, budget: 0, tokens: { prompt: 0, completion: 0 } },
  };

  try {
    const stream = await pipeline.stream(initialState as never, {
      ...config,
      streamMode: "updates",
    });
    for await (const update of stream as AsyncIterable<Record<string, unknown>>) {
      for (const nodeName of Object.keys(update)) {
        await publish({
          type: "agent.thought",
          agent: nodeName,
          summary: AGENT_LABELS[nodeName] ?? `${nodeName} finished`,
        });
      }
    }

    const snapshot = await pipeline.getState(config);
    const state = snapshot.values as PipelineState;
    const lastReport = state.criticReports?.[state.criticReports.length - 1];

    // Constraint gate rejected the concept outright (e.g. Ladakh in January):
    // surface the honest reason instead of a generic failure.
    const blocking = (state.criticReports ?? []).flatMap((r) =>
      r.issues.filter(
        (i) => i.severity === "blocking" && String(i.criterion).startsWith("constraint:"),
      ),
    );
    if (blocking.length > 0 && !(state.graph?.days?.length > 0)) {
      await publish({
        type: "job.failed",
        stage: "constraint_gate",
        userMessage: blocking.map((i) => i.suggested_fix).join(" "),
        resumable: false,
      });
      if (tripId) await setTripStatus(db, tripId, "draft");
      return;
    }

    if (lastReport) {
      await publish({
        type: "critic.verdict",
        pass: !lastReport.issues.some((i) => i.severity === "blocking"),
        issues: lastReport.issues,
      });
    }

    const graph: PlanGraph = {
      ...state.graph,
      meta: {
        trip_id: tripId ?? jobId,
        version: 1, // savePlanGraphVersion stamps the real version
        profile_version: 1,
        status: "validated",
        critic_score: lastReport?.score,
        created_by_job: jobId,
      },
    };
    const parsed = safeParsePlanGraph(graph);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" | ");
      await publish({
        type: "job.failed",
        stage: "assemble",
        userMessage: "The generated plan failed validation — please retry.",
        resumable: false,
      });
      throw new Error(`generated PlanGraph invalid: ${detail}`);
    }

    let version: number | undefined;
    if (tripId) {
      const saved = await savePlanGraphVersion(db, {
        graph: parsed.data,
        jobId,
        criticScore: lastReport?.score,
      });
      version = saved.version;
      await setTripStatus(db, tripId, "active");
    }
    await publish({ type: "job.completed", version });
  } catch (err) {
    if (tripId) await setTripStatus(db, tripId, "draft").catch(() => undefined);
    await publish({
      type: "job.failed",
      stage: "pipeline",
      userMessage: "Plan generation hit an error — please retry.",
      resumable: false,
    }).catch(() => undefined);
    throw err;
  }
}
