"use client";

import React from "react";
import { PlanGraph } from "@raah/plan-graph";
import { Overview } from "./Overview";
import { DaysList } from "./DayCard";
import { Annexes } from "./Annexes";

export function ItineraryDocument({ graph }: { graph: PlanGraph }) {
  if (!graph) return null;

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {/* 1. Overview hydrated first */}
      {graph.concept && <Overview graph={graph} />}

      {/* 2. Days hydrated in order */}
      {graph.days && <DaysList days={graph.days} />}

      {/* 3. Annexes hydrated last */}
      <Annexes
        legs={graph.legs}
        budget={graph.budget}
        fragileLegs={graph.risk}
        pretrip={graph.pretrip}
        packing={graph.packing}
      />
    </div>
  );
}
