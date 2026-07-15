"use client";

import React from "react";
import { PlanDiff, summarizeDiff, PlanGraph } from "@raah/plan-graph";

interface DiffBannerProps {
  planDiff: PlanDiff;
  before: PlanGraph;
  after: PlanGraph;
  onAccept: () => void;
  onRevert: () => void;
}

export function DiffBanner({ planDiff, before, after, onAccept, onRevert }: DiffBannerProps) {
  const hunks = React.useMemo(
    () => summarizeDiff(planDiff, before, after),
    [planDiff, before, after],
  );

  if (hunks.length === 0) return null;

  return (
    <div className="bg-[var(--color-primary)] text-white p-4 rounded-lg shadow flex flex-col gap-3 mb-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg">Proposed Changes</h3>
        <div className="flex gap-2">
          <button
            onClick={onRevert}
            className="px-3 py-1 bg-white text-[var(--color-primary)] rounded hover:bg-gray-100 transition-colors text-sm"
          >
            Revert
          </button>
          <button
            onClick={onAccept}
            className="px-3 py-1 bg-[var(--color-secondary)] text-[var(--color-primary)] font-medium rounded hover:bg-opacity-90 transition-colors text-sm"
          >
            Accept All
          </button>
        </div>
      </div>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {hunks.map((hunk, idx) => (
          <li key={idx}>{hunk.text}</li>
        ))}
      </ul>
    </div>
  );
}
