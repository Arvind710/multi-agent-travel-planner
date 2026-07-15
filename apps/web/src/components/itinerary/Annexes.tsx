"use client";

import React from "react";
import { TransitLeg, Ledger, FragileLeg, TimelineItem, PackingList } from "@raah/plan-graph";

export function LogisticsLeg({ leg }: { leg: TransitLeg }) {
  return (
    <div className="bg-card p-4 rounded-xl border border-border mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="font-semibold">{leg.mode.toUpperCase()}</span>
        <span className="text-sm text-muted-foreground">
          {leg.realistic_duration_minutes}m (honest)
        </span>
      </div>
      <div className="text-sm">
        {leg.operator && <p>Operator: {leg.operator}</p>}
        {leg.booking && <p>Book via: {leg.booking.channel}</p>}
      </div>
    </div>
  );
}

export function BudgetLedger({ ledger }: { ledger: Ledger }) {
  if (!ledger) return null;
  return (
    <div className="bg-muted p-6 rounded-xl mb-8">
      <h3 className="text-xl font-bold mb-4">Budget Ledger</h3>
      <div className="flex justify-between font-semibold border-b border-border pb-2 mb-2">
        <span>Total ({ledger.total.currency})</span>
        <span>{ledger.total.amount}</span>
      </div>
      <div className="space-y-1 text-sm">
        {ledger.line_items.map((item, idx) => (
          <div key={idx} className="flex justify-between">
            <span>{item.label}</span>
            <span>{item.amount.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Annexes({
  legs,
  budget,
  fragileLegs,
  pretrip,
  packing,
}: {
  legs?: TransitLeg[];
  budget?: Ledger;
  fragileLegs?: FragileLeg[];
  pretrip?: TimelineItem[];
  packing?: PackingList;
}) {
  return (
    <section id="annexes" className="max-w-4xl mx-auto px-4 mt-16 pt-8 border-t border-border">
      <h2 className="text-3xl font-bold mb-8">Trip Annexes</h2>

      {budget && <BudgetLedger ledger={budget} />}

      <div className="mb-8">
        <h3 className="text-xl font-bold mb-4">Logistics</h3>
        {legs?.map((leg) => (
          <LogisticsLeg key={leg.node_id} leg={leg} />
        ))}
      </div>

      {fragileLegs && fragileLegs.length > 0 && (
        <div className="mb-8 bg-destructive/10 p-4 rounded-xl">
          <h3 className="text-xl font-bold mb-2 text-destructive">Risk & Resilience</h3>
          <ul className="list-disc pl-5">
            {fragileLegs.map((f) => (
              <li key={f.node_id}>
                {f.cause} (Plan B: {f.plan_b.summary})
              </li>
            ))}
          </ul>
        </div>
      )}

      {pretrip && pretrip.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4">Pre-trip Timeline</h3>
          <ul className="space-y-2">
            {pretrip.map((p) => (
              <li key={p.node_id} className="text-sm">
                • {p.label} (Due: {p.due})
              </li>
            ))}
          </ul>
        </div>
      )}

      {packing && packing.items && (
        <div className="mb-8">
          <h3 className="text-xl font-bold mb-4">Packing List</h3>
          <div className="flex flex-wrap gap-2">
            {packing.items.map((item, idx) => (
              <span
                key={idx}
                className="bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded"
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
