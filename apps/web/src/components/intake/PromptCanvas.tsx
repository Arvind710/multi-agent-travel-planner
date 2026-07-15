"use client";

import { useState } from "react";
// Stub implementation of PromptCanvas

interface PromptCanvasProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
}

export function PromptCanvas({ onSubmit, isLoading }: PromptCanvasProps) {
  const [prompt, setPrompt] = useState("");

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg shadow-sm bg-white">
      <h2 className="text-xl font-bold">Where would you like to go?</h2>
      <textarea
        className="w-full p-3 border rounded-md min-h-[120px] focus:ring-2 focus:ring-blue-500"
        placeholder="E.g., A 10-day road trip through Ladakh in July for 2 adults..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={isLoading}
      />
      <button
        className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 self-end"
        onClick={() => onSubmit(prompt)}
        disabled={isLoading || prompt.trim() === ""}
      >
        {isLoading ? "Analyzing..." : "Start Planning"}
      </button>
    </div>
  );
}
