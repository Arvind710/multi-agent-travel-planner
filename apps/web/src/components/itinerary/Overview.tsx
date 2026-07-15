"use client";

import React from "react";
import { PlanGraph } from "@raah/plan-graph";

export function TripHeader({ concept }: { concept: PlanGraph["concept"] }) {
  if (!concept) return null;
  return (
    <div className="py-8 text-center border-b border-border">
      <h1 className="text-4xl font-bold mb-4">{concept.title}</h1>
      <p className="text-lg text-muted-foreground">{concept.narrative}</p>
    </div>
  );
}

export function WhyCallout({ reasons }: { reasons: string[] }) {
  if (!reasons?.length) return null;
  return (
    <div className="bg-primary/10 p-6 rounded-xl my-8">
      <h3 className="text-xl font-semibold mb-4 text-primary">Why this trip</h3>
      <ul className="list-disc pl-5 space-y-2">
        {reasons.map((reason, idx) => (
          <li key={idx} className="text-foreground">
            {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AssumptionChip({ assumptions }: { assumptions: string[] }) {
  if (!assumptions?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 my-4">
      {assumptions.map((assump, idx) => (
        <span
          key={idx}
          className="bg-secondary text-secondary-foreground text-sm px-3 py-1 rounded-full"
        >
          Assumed: {assump}
        </span>
      ))}
    </div>
  );
}

export function RouteMapStub({ stops }: { stops: any[] }) {
  if (!stops?.length) return null;
  return (
    <div className="w-full h-64 bg-muted flex items-center justify-center rounded-xl my-6">
      <p className="text-muted-foreground">Map rendering {stops.length} stops</p>
    </div>
  );
}

export function Overview({ graph }: { graph: PlanGraph }) {
  if (!graph.concept) return null;
  // NOTE: WhyCallout and Assumptions would come from Narrator in meta, here we mock them if undefined
  return (
    <section id="overview" className="max-w-4xl mx-auto px-4">
      <TripHeader concept={graph.concept} />
      <AssumptionChip assumptions={["You are flying out of DEL", "Standard physical mobility"]} />
      <RouteMapStub stops={graph.route || []} />
      <WhyCallout
        reasons={[
          "Follows a relaxed pace suitable for families",
          "Minimizes inter-city drive time",
          "Includes one premium heritage stay",
        ]}
      />
    </section>
  );
}
