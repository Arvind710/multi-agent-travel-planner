"use client";

import React, { useState } from "react";
import { VersionHistory } from "@/components/itinerary/VersionHistory";
import { SwapSheet } from "@/components/itinerary/SwapSheet";
import { ItineraryDocument } from "@/components/itinerary/ItineraryDocument";

// Mock implementation of the trip page
export default function TripPage({ params: _params }: { params: Promise<{ id: string }> }) {
  const [currentVersion, setCurrentVersion] = useState(1);
  const [showSwapSheet, setShowSwapSheet] = useState(false);
  const [swapNodeId, setSwapNodeId] = useState<string | null>(null);

  // State for NLP edits
  const [chatInput, setChatInput] = useState("");
  const [activeDiff, setActiveDiff] = useState<any | null>(null);
  const [hasConstraint, setHasConstraint] = useState(false);

  // Maintain versions
  const [versions, setVersions] = useState<any[]>([
    {
      id: "v1",
      version: 1,
      created_at: new Date().toISOString(),
      graph: {
        concept: {
          title: "Rajasthan Royal Tour",
          narrative: "A journey through forts and palaces.",
        },
        days: [
          {
            node_id: "day_1",
            date: "2026-10-10",
            blocks: [
              {
                node_id: "block_1",
                type: "experience",
                title: "Amber Fort Tour",
                duration_hours: 4,
              },
            ],
          },
        ],
        budget: { total: { amount: 50000, currency: "INR" }, line_items: [] },
      },
    },
  ]);

  const activeGraph =
    versions.find((v) => v.version === currentVersion)?.graph || versions[0].graph;

  const handleSwapRequest = (nodeId: string) => {
    setSwapNodeId(nodeId);
    setShowSwapSheet(true);
  };

  const handleUpdatePlan = () => {
    const inputStr = chatInput.toLowerCase();
    const newVersionNum = Math.max(...versions.map((v) => v.version)) + 1;
    const newGraph = { ...activeGraph };
    let newDiff = null;

    if (inputStr.includes("lighter")) {
      newDiff = {
        added: [],
        removed: [],
        changed: [],
        moved: [],
        meta_changed: [],
        _hunks: [{ text: "Removed: Afternoon Tour, Added: Free Time", node_refs: ["day_1"] }],
      };
    } else if (inputStr.includes("stairs")) {
      newDiff = {
        added: [],
        removed: [],
        changed: [],
        moved: [],
        meta_changed: [],
        _hunks: [
          { text: "Swapped accommodation: Haveli -> Ground Floor Hotel", node_refs: ["stay_123"] },
        ],
      };
      setHasConstraint(true);
    } else {
      return; // No-op if unknown mock
    }

    const newVersion = {
      id: `v${newVersionNum}`,
      version: newVersionNum,
      created_at: new Date().toISOString(),
      graph: newGraph,
    };

    setVersions([...versions, newVersion]);
    setCurrentVersion(newVersionNum);
    setActiveDiff(newDiff);
    setChatInput("");
  };

  const handleAccept = () => {
    setActiveDiff(null);
  };

  const handleRevert = () => {
    // Revert to parent version
    setCurrentVersion(currentVersion - 1);
    setActiveDiff(null);
  };

  const handleRollback = (version: number) => {
    setCurrentVersion(version);
    setActiveDiff(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 max-w-5xl">
        <header className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold">{activeGraph.concept.title}</h1>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 bg-white border rounded shadow-sm text-sm hover:bg-gray-50"
              onClick={() => {
                const url = window.location.href;
                navigator.clipboard.writeText(
                  `Hey! Check out this itinerary for ${activeGraph.concept.title} I planned using Raah: ${url}`,
                );
                alert("WhatsApp summary copied to clipboard!");
              }}
            >
              Share via WhatsApp
            </button>
            <button className="px-3 py-1.5 bg-white border rounded shadow-sm text-sm hover:bg-gray-50">
              Share
            </button>
            <button className="px-3 py-1.5 bg-white border rounded shadow-sm text-sm hover:bg-gray-50">
              Export PDF
            </button>
            {process.env.NEXT_PUBLIC_FLAG_FEATURES_PRICE_WATCH === "true" && (
              <button
                className="px-3 py-1.5 bg-[var(--color-primary)] text-white border rounded shadow-sm text-sm hover:bg-opacity-90"
                onClick={() => alert("Price watch feature coming soon! (Stub)")}
              >
                Track Prices
              </button>
            )}
          </div>
        </header>

        {hasConstraint && (
          <div
            data-testid="mobility-constraint"
            className="mb-4 inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full border border-blue-200"
          >
            <span>♿ No stairs requested</span>
          </div>
        )}

        {/* Show diff banner if there are unaccepted changes */}
        {activeDiff && (
          <div
            data-testid="diff-banner"
            className="bg-[var(--color-primary)] text-white p-4 rounded-lg shadow flex flex-col gap-3 mb-4"
          >
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg">Proposed Changes</h3>
              <div className="flex gap-2">
                <button
                  onClick={handleRevert}
                  className="px-3 py-1 bg-white text-[var(--color-primary)] rounded hover:bg-gray-100 transition-colors text-sm"
                >
                  Revert
                </button>
                <button
                  onClick={handleAccept}
                  className="px-3 py-1 bg-[var(--color-secondary)] text-[var(--color-primary)] font-medium rounded hover:bg-opacity-90 transition-colors text-sm"
                >
                  Accept All
                </button>
              </div>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {activeDiff._hunks.map((hunk: any, idx: number) => (
                <li key={idx} data-testid="diff-hunk">
                  {hunk.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white rounded-xl shadow p-6">
          <ItineraryDocument graph={activeGraph} />

          <div className="mt-8 border-t pt-4 text-center">
            <button
              onClick={() => handleSwapRequest("stay_123")}
              className="text-sm text-[var(--color-primary)] font-medium underline"
            >
              Swap Accommodation
            </button>
          </div>
        </div>
      </main>

      {/* Sidebar */}
      <aside className="w-full md:w-80 p-4 border-l bg-white">
        <div className="mb-8">
          <h3 className="font-semibold text-lg mb-3">Ask Raah</h3>
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="w-full border rounded-lg p-3 text-sm focus:outline-[var(--color-primary)]"
            rows={3}
            placeholder="E.g. Make day 3 lighter, or swap the Jaipur hotel..."
            data-testid="chat-input"
          ></textarea>
          <button
            onClick={handleUpdatePlan}
            className="w-full mt-2 bg-[var(--color-primary)] text-white py-2 rounded font-medium hover:bg-opacity-90"
            data-testid="update-plan-btn"
          >
            Update Plan
          </button>
        </div>

        <VersionHistory
          versions={versions}
          currentVersion={currentVersion}
          onSelectVersion={setCurrentVersion}
          onRollback={handleRollback}
        />
      </aside>

      {showSwapSheet && swapNodeId && (
        <SwapSheet
          nodeId={swapNodeId}
          title="Accommodation"
          alternatives={[
            {
              id: "alt1",
              name: "Taj Rambagh",
              description: "Luxury palace hotel",
              cost_delta: 15000,
            },
            {
              id: "alt2",
              name: "Alsisar Haveli",
              description: "Heritage boutique",
              cost_delta: -2000,
            },
          ]}
          onApply={async (altId) => {
            console.log("Swapped to", altId);
          }}
          onClose={() => setShowSwapSheet(false)}
        />
      )}
    </div>
  );
}
