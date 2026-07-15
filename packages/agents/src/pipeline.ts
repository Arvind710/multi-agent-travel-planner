import { START, END, MemorySaver } from "@langchain/langgraph";
import type { KnowledgeBase } from "@raah/kb";
import { AgentRuntime, PipelineState } from "./runtime";
import { ConceptArchitectAgent } from "./concept-architect";
import { makeConstraintGateNode } from "./constraint-gate";
import { ModelRouter } from "./router";

import { RouteOptimizerAgent } from "./route-optimizer";
import { LogisticsAgent } from "./logistics-agent";
import { StayCuratorAgent } from "./stay-curator";
import { ExperienceCuratorAgent } from "./experience-curator";
import { FoodCuratorAgent } from "./food-curator";
import { BudgetReconcilerAgent } from "./budget-reconciler";
import { RiskAgent } from "./risk-agent";
import { PretripGeneratorAgent } from "./pretrip-generator";
import { CriticAgent } from "./critic";
import { NarratorAgent } from "./narrator";

/** Everything the pipeline needs injected; the KB grounds agents + gates. */
export interface PipelineDeps {
  kb: KnowledgeBase;
}

export function buildPipeline({ kb }: PipelineDeps) {
  const runtime = new AgentRuntime();
  const router = new ModelRouter();
  const architect = new ConceptArchitectAgent(router, kb);
  const routeOptimizer = new RouteOptimizerAgent(router, kb);
  const logistics = new LogisticsAgent(router, kb);
  const stayCurator = new StayCuratorAgent(router, kb);
  const experienceCurator = new ExperienceCuratorAgent(router, kb);
  const foodCurator = new FoodCuratorAgent(router, kb);
  const budgetReconciler = new BudgetReconcilerAgent(router);
  const riskAgent = new RiskAgent(router, kb);
  const pretripGenerator = new PretripGeneratorAgent(router, kb);
  const critic = new CriticAgent(router);
  const narrator = new NarratorAgent(router);
  const constraintGateNode = makeConstraintGateNode(kb);

  const workflow = runtime.graph;

  // 1. Concept Generation
  workflow.addNode("architect", async (state: PipelineState) => {
    const concepts = await architect.generateConcepts(state.profile);
    return { graph: { concept: concepts[0] } as any };
  });

  // 2. Constraint Check
  workflow.addNode("constraintGate", constraintGateNode);

  // 3. Route Optimization
  workflow.addNode("routeOptimizer", async (state: PipelineState) => {
    const { stops, legs } = await routeOptimizer.optimizeRoute(state.profile, state.graph.concept);
    return { graph: { route: stops, legs } as any };
  });

  // 4a. Logistics (Parallel)
  workflow.addNode("logistics", async (state: PipelineState) => {
    const enrichedLegs = await logistics.enrichLegs(state.graph.legs);
    return { graph: { legs: enrichedLegs } as any };
  });

  // 4b. Stay Curator (Parallel)
  workflow.addNode("stayCurator", async (state: PipelineState) => {
    const stays = await stayCurator.curateStays(state.profile, state.graph.route);
    return { graph: { stays } as any };
  });

  // 4c. Experience Curator (Parallel) -> Food Curator (Sequential)
  workflow.addNode("experienceCurator", async (state: PipelineState) => {
    const days = await experienceCurator.curateExperiences(state.profile, state.graph.route);
    return { graph: { days } as any };
  });
  workflow.addNode("foodCurator", async (state: PipelineState) => {
    const enrichedDays = await foodCurator.curateFood(
      state.profile,
      state.graph.days,
      state.graph.route,
    );
    return { graph: { days: enrichedDays } as any };
  });

  // 5. Synchronization Node (dummy node to join parallel branches)
  workflow.addNode("syncDomain", async () => {
    return {};
  });

  // 6. Post-Domain Agents (Budget, Risk, Pretrip)
  workflow.addNode("budgetReconciler", async (state: PipelineState) => {
    const ledger = await budgetReconciler.reconcileBudget(state.profile, state.graph);
    return { graph: { budget: ledger } as any };
  });

  workflow.addNode("riskAgent", async (state: PipelineState) => {
    const risk = await riskAgent.assessRisk(state.profile, state.graph);
    return { graph: { risk } as any };
  });

  workflow.addNode("pretripGenerator", async (state: PipelineState) => {
    const { pretrip, packing } = await pretripGenerator.generatePretrip(state.profile, state.graph);
    return { graph: { pretrip, packing } as any };
  });

  // 7. Critic Loop
  workflow.addNode("critic", async (state: PipelineState) => {
    const report = await critic.evaluatePlan(state.profile, state.graph);
    return { criticReports: [report], iteration: state.iteration + 1 };
  });

  // 8. Narrator
  workflow.addNode("narrator", async (state: PipelineState) => {
    const data = await narrator.generateNarrative(state.profile, state.graph);
    // Merge narrative into concept
    return { graph: { concept: { ...state.graph.concept, narrative: data.narrative } } as any };
  });

  // 9. Constraint Re-Gate
  workflow.addNode("constraintReGate", async (state: PipelineState) => {
    const feedback = await constraintGateNode(state);
    const hasBlocking = feedback.criticReports?.some((r: any) =>
      r.issues.some((i: any) => i.severity === "blocking"),
    );
    if (hasBlocking) {
      // In production, this throws and alerts.
      console.error("Constraint Re-Gate Failed with blocking violations:", feedback.criticReports);
      throw new Error("Final constraint validation failed.");
    }
    return {};
  });

  // Edges
  workflow.addEdge(START, "architect" as any);
  workflow.addEdge("architect" as any, "constraintGate" as any);

  // From constraintGate to routeOptimizer
  workflow.addConditionalEdges("constraintGate" as any, (state: PipelineState) => {
    if (state.criticReports && state.criticReports.length > 0) return END; // Failed
    return "routeOptimizer";
  });

  // Parallel fan-out
  workflow.addEdge("routeOptimizer" as any, "logistics" as any);
  workflow.addEdge("routeOptimizer" as any, "stayCurator" as any);
  workflow.addEdge("routeOptimizer" as any, "experienceCurator" as any);

  // Experience -> Food
  workflow.addEdge("experienceCurator" as any, "foodCurator" as any);

  // Fan-in to syncDomain
  workflow.addEdge("logistics" as any, "syncDomain" as any);
  workflow.addEdge("stayCurator" as any, "syncDomain" as any);
  workflow.addEdge("foodCurator" as any, "syncDomain" as any); // Food is the end of the Experience track

  // From syncDomain to final agents
  workflow.addEdge("syncDomain" as any, "budgetReconciler" as any);
  workflow.addEdge("syncDomain" as any, "riskAgent" as any);
  workflow.addEdge("syncDomain" as any, "pretripGenerator" as any);

  // Sync post-domain to critic (we need a join node or run sequentially, but let's just make pretrip wait for budget and risk for simplicity, or add another sync node)
  workflow.addNode("syncPreCritic", async () => ({}));
  workflow.addEdge("budgetReconciler" as any, "syncPreCritic" as any);
  workflow.addEdge("riskAgent" as any, "syncPreCritic" as any);
  workflow.addEdge("pretripGenerator" as any, "syncPreCritic" as any);

  workflow.addEdge("syncPreCritic" as any, "critic" as any);

  // Critic Conditional Edge
  workflow.addConditionalEdges("critic" as any, (state: PipelineState) => {
    const latestReport = state.criticReports[state.criticReports.length - 1];
    const hasBlocking = latestReport?.issues.some((i: any) => i.severity === "blocking");

    if (hasBlocking && state.iteration < 3) {
      // Loop back to routeOptimizer (in v0, we re-run the domain agents)
      return "routeOptimizer";
    }

    return "constraintReGate";
  });

  // Re-gate to Narrator
  workflow.addEdge("constraintReGate" as any, "narrator" as any);

  // Narrator to END
  workflow.addEdge("narrator" as any, END);

  const checkpointer = new MemorySaver();
  const app = workflow.compile({ checkpointer });
  return app;
}

export function buildRevisionPipeline({ kb }: PipelineDeps) {
  const runtime = new AgentRuntime();
  const router = new ModelRouter();
  const routeOptimizer = new RouteOptimizerAgent(router, kb);
  const logistics = new LogisticsAgent(router, kb);
  const stayCurator = new StayCuratorAgent(router, kb);
  const experienceCurator = new ExperienceCuratorAgent(router, kb);
  const foodCurator = new FoodCuratorAgent(router, kb);
  const budgetReconciler = new BudgetReconcilerAgent(router);
  const riskAgent = new RiskAgent(router, kb);
  const pretripGenerator = new PretripGeneratorAgent(router, kb);
  const critic = new CriticAgent(router);
  const narrator = new NarratorAgent(router);
  const constraintGateNode = makeConstraintGateNode(kb);

  const workflow = runtime.graph;

  const isDirtyNode = (state: PipelineState, check: (id: string) => boolean) => {
    if (state.dirty === "all") return true;
    return state.dirty?.node_ids?.some(check) ?? false;
  };

  const isDirtySection = (state: PipelineState, section: string) => {
    if (state.dirty === "all") return true;
    return state.dirty?.sections?.includes(section as any) ?? false;
  };

  workflow.addNode("routeOptimizer", async (state: PipelineState) => {
    if (!isDirtyNode(state, (id) => id.startsWith("stop_") || id.startsWith("leg_"))) return {};
    const { stops, legs } = await routeOptimizer.optimizeRoute(state.profile, state.graph.concept);
    return { graph: { route: stops, legs } as any };
  });

  workflow.addNode("logistics", async (state: PipelineState) => {
    if (!isDirtyNode(state, (id) => id.startsWith("leg_"))) return {};
    const enrichedLegs = await logistics.enrichLegs(state.graph.legs);
    return { graph: { legs: enrichedLegs } as any };
  });

  workflow.addNode("stayCurator", async (state: PipelineState) => {
    if (!isDirtyNode(state, (id) => id.startsWith("stay_"))) return {};
    const stays = await stayCurator.curateStays(state.profile, state.graph.route);
    return { graph: { stays } as any };
  });

  workflow.addNode("experienceCurator", async (state: PipelineState) => {
    if (!isDirtyNode(state, (id) => id.startsWith("day_") || id.startsWith("block_"))) return {};
    const days = await experienceCurator.curateExperiences(state.profile, state.graph.route);
    return { graph: { days } as any };
  });

  workflow.addNode("foodCurator", async (state: PipelineState) => {
    if (!isDirtyNode(state, (id) => id.startsWith("meal_") || id.startsWith("day_"))) return {};
    const enrichedDays = await foodCurator.curateFood(
      state.profile,
      state.graph.days,
      state.graph.route,
    );
    return { graph: { days: enrichedDays } as any };
  });

  workflow.addNode("syncDomain", async () => ({}));

  workflow.addNode("budgetReconciler", async (state: PipelineState) => {
    if (!isDirtySection(state, "budget")) return {};
    const ledger = await budgetReconciler.reconcileBudget(state.profile, state.graph);
    return { graph: { budget: ledger } as any };
  });

  workflow.addNode("riskAgent", async (state: PipelineState) => {
    if (!isDirtySection(state, "risk")) return {};
    const risk = await riskAgent.assessRisk(state.profile, state.graph);
    return { graph: { risk } as any };
  });

  workflow.addNode("pretripGenerator", async (state: PipelineState) => {
    if (!isDirtySection(state, "pretrip") && !isDirtySection(state, "packing")) return {};
    const { pretrip, packing } = await pretripGenerator.generatePretrip(state.profile, state.graph);
    return { graph: { pretrip, packing } as any };
  });

  workflow.addNode("critic", async (state: PipelineState) => {
    const report = await critic.evaluatePlan(state.profile, state.graph);
    return { criticReports: [report], iteration: state.iteration + 1 };
  });

  workflow.addNode("narrator", async (state: PipelineState) => {
    const data = await narrator.generateNarrative(state.profile, state.graph);
    return { graph: { concept: { ...state.graph.concept, narrative: data.narrative } } as any };
  });

  workflow.addNode("constraintReGate", async (state: PipelineState) => {
    const feedback = await constraintGateNode(state);
    const hasBlocking = feedback.criticReports?.some((r: any) =>
      r.issues.some((i: any) => i.severity === "blocking"),
    );
    if (hasBlocking) {
      console.error("Constraint Re-Gate Failed with blocking violations:", feedback.criticReports);
      throw new Error("Final constraint validation failed.");
    }
    return {};
  });

  workflow.addEdge(START, "routeOptimizer" as any);

  workflow.addEdge("routeOptimizer" as any, "logistics" as any);
  workflow.addEdge("routeOptimizer" as any, "stayCurator" as any);
  workflow.addEdge("routeOptimizer" as any, "experienceCurator" as any);
  workflow.addEdge("experienceCurator" as any, "foodCurator" as any);

  workflow.addEdge("logistics" as any, "syncDomain" as any);
  workflow.addEdge("stayCurator" as any, "syncDomain" as any);
  workflow.addEdge("foodCurator" as any, "syncDomain" as any);

  workflow.addEdge("syncDomain" as any, "budgetReconciler" as any);
  workflow.addEdge("syncDomain" as any, "riskAgent" as any);
  workflow.addEdge("syncDomain" as any, "pretripGenerator" as any);

  workflow.addNode("syncPreCritic", async () => ({}));
  workflow.addEdge("budgetReconciler" as any, "syncPreCritic" as any);
  workflow.addEdge("riskAgent" as any, "syncPreCritic" as any);
  workflow.addEdge("pretripGenerator" as any, "syncPreCritic" as any);

  workflow.addEdge("syncPreCritic" as any, "critic" as any);

  workflow.addConditionalEdges("critic" as any, (state: PipelineState) => {
    const latestReport = state.criticReports[state.criticReports.length - 1];
    const hasBlocking = latestReport?.issues.some((i: any) => i.severity === "blocking");
    if (hasBlocking && state.iteration < 3) return "routeOptimizer";
    return "constraintReGate";
  });

  workflow.addEdge("constraintReGate" as any, "narrator" as any);
  workflow.addEdge("narrator" as any, END);

  const checkpointer = new MemorySaver();
  const app = workflow.compile({ checkpointer });
  return app;
}
