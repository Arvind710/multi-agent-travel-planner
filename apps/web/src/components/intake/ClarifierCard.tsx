"use client";

import { useState } from "react";
import { Clarifier } from "@raah/agents";

interface ClarifierCardProps {
  clarifier: Clarifier;
  onAnswer: (clarifierId: string, answer: string) => void;
}

export function ClarifierCard({ clarifier, onAnswer }: ClarifierCardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white mb-4">
      <h3 className="font-semibold text-gray-900 mb-2">{clarifier.question}</h3>
      <div className="flex flex-col gap-2">
        {clarifier.options.map((option: string, idx: number) => (
          <button
            key={idx}
            className={`px-4 py-2 text-left rounded-md border hover:bg-blue-50 ${
              selected === option ? "bg-blue-100 border-blue-500" : "bg-white border-gray-200"
            }`}
            onClick={() => {
              setSelected(option);
              onAnswer(clarifier.id, option);
            }}
          >
            {option}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-4 italic">
        Why we are asking: {clarifier.asked_because}
      </p>
    </div>
  );
}
