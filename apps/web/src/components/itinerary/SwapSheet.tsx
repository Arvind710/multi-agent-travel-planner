"use client";

import React, { useState } from "react";

interface Alternative {
  id: string;
  name: string;
  description: string;
  cost_delta: number;
}

interface SwapSheetProps {
  nodeId: string;
  title: string;
  alternatives: Alternative[];
  onApply: (altId: string) => Promise<void>;
  onClose: () => void;
}

export function SwapSheet({ title, alternatives, onApply, onClose }: SwapSheetProps) {
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = async (altId: string) => {
    setIsApplying(true);
    try {
      await onApply(altId);
    } finally {
      setIsApplying(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50">
      <div className="bg-white w-full max-w-lg rounded-t-xl p-6 shadow-xl animate-slide-up">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Swap {title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            &times;
          </button>
        </div>

        {alternatives.length === 0 ? (
          <p className="text-gray-500 italic">No alternatives available.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {alternatives.map((alt) => (
              <div
                key={alt.id}
                className="border rounded-lg p-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
              >
                <div>
                  <h4 className="font-medium text-[var(--color-primary)]">{alt.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">{alt.description}</p>
                  <p
                    className={`text-sm mt-2 font-medium ${alt.cost_delta > 0 ? "text-red-500" : alt.cost_delta < 0 ? "text-green-500" : "text-gray-500"}`}
                  >
                    {alt.cost_delta > 0 ? "+" : ""}
                    {alt.cost_delta === 0 ? "Same price" : `₹${Math.abs(alt.cost_delta)}`}
                  </p>
                </div>
                <button
                  disabled={isApplying}
                  onClick={() => handleApply(alt.id)}
                  className="px-4 py-2 bg-[var(--color-primary)] text-white rounded hover:bg-opacity-90 disabled:opacity-50"
                >
                  Swap
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
