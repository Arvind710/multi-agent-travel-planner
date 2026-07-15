"use client";

import React from "react";
import { PlanGraph } from "@raah/plan-graph";
import { DateTime } from "luxon";

interface VersionRecord {
  id: string;
  version: number;
  created_at: string;
  parent_ref?: string;
  graph: PlanGraph;
}

interface VersionHistoryProps {
  versions: VersionRecord[];
  currentVersion: number;
  onSelectVersion: (v: number) => void;
  onRollback: (v: number) => void;
}

export function VersionHistory({
  versions,
  currentVersion,
  onSelectVersion,
  onRollback,
}: VersionHistoryProps) {
  // Sort versions descending
  const sorted = [...versions].sort((a, b) => b.version - a.version);

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm">
      <h3 className="font-semibold text-lg mb-3">Version History</h3>
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-2">
        {sorted.map((v) => (
          <div
            key={v.id}
            className={`p-3 rounded border text-sm flex justify-between items-center transition-colors cursor-pointer ${
              v.version === currentVersion
                ? "bg-[var(--color-primary)] text-white border-transparent"
                : "hover:bg-gray-50 border-gray-200"
            }`}
            onClick={() => onSelectVersion(v.version)}
          >
            <div>
              <div className="font-medium">
                Version {v.version} {v.version === currentVersion && "(Current)"}
              </div>
              <div className={v.version === currentVersion ? "text-blue-100" : "text-gray-500"}>
                {DateTime.fromISO(v.created_at).toFormat("MMM d, h:mm a")}
              </div>
            </div>
            {v.version !== currentVersion && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRollback(v.version);
                }}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded transition-colors"
              >
                Restore
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
