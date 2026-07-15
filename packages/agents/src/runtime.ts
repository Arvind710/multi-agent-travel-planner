import { StateGraph, StateGraphArgs } from "@langchain/langgraph";
import { TravellerProfile } from "@raah/shared/profile";
import { PlanGraph } from "@raah/plan-graph";

import type { DirtySet, DirtySection, NodeId } from "@raah/plan-graph";

export interface CriticReport {
  score: number;
  issues: {
    node_ref: string;
    criterion: string;
    severity: "blocking" | "warning";
    suggested_fix: string;
  }[];
}

export interface TokenLedger {
  spent: number;
  budget: number;
  tokens: {
    prompt: number;
    completion: number;
  };
}

export interface PipelineState {
  profile: TravellerProfile;
  graph: PlanGraph;
  dirty: DirtySet | "all";
  criticReports: CriticReport[];
  iteration: number;
  budgetSpend: TokenLedger;
}

// The LangGraph state definition object (reducers)
export const pipelineStateChannels: StateGraphArgs<PipelineState>["channels"] = {
  profile: {
    value: (a: TravellerProfile | undefined, b: TravellerProfile | undefined) =>
      b ?? a ?? ({} as TravellerProfile),
  },
  graph: {
    value: (a: PlanGraph | undefined, b: PlanGraph | undefined) => {
      if (!a) return b ?? ({} as PlanGraph);
      if (!b) return a;
      return { ...a, ...b };
    },
  },
  dirty: {
    value: (a: DirtySet | "all" | undefined, b: DirtySet | "all" | undefined) => {
      if (b === "all") return "all";
      if (a === "all") return "all";
      const node_ids = new Set<NodeId>(a?.node_ids ?? []);
      const sections = new Set<DirtySection>(a?.sections ?? []);
      if (b) {
        for (const item of b.node_ids) node_ids.add(item);
        for (const item of b.sections) sections.add(item);
      }
      return { node_ids: Array.from(node_ids), sections: Array.from(sections) };
    },
  },
  criticReports: {
    value: (a: CriticReport[] | undefined, b: CriticReport[] | undefined) => {
      return (a ?? []).concat(b ?? []);
    },
  },
  iteration: {
    value: (a: number | undefined, b: number | undefined) => (b !== undefined ? b : (a ?? 0)),
  },
  budgetSpend: {
    value: (a: TokenLedger | undefined, b: TokenLedger | undefined) => {
      if (!a) return b ?? { spent: 0, budget: 0, tokens: { prompt: 0, completion: 0 } };
      if (!b) return a;
      return {
        spent: a.spent + b.spent,
        budget: a.budget,
        tokens: {
          prompt: a.tokens.prompt + b.tokens.prompt,
          completion: a.tokens.completion + b.tokens.completion,
        },
      };
    },
  },
};

export class AgentRuntime {
  public graph: StateGraph<PipelineState>;

  constructor() {
    this.graph = new StateGraph<PipelineState>({ channels: pipelineStateChannels });
  }
}
