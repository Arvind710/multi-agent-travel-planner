"use client";

interface AgentProgressRailProps {
  status: "idle" | "parsing" | "clarifying" | "generating_plan" | "done";
}

export function AgentProgressRail({ status }: AgentProgressRailProps) {
  const steps = [
    { id: "parsing", label: "Understanding Request" },
    { id: "clarifying", label: "Resolving Ambiguity" },
    { id: "generating_plan", label: "Building Concept" },
  ];

  return (
    <div className="p-4 bg-gray-50 border-l-4 border-blue-500">
      <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
        Agent Progress
      </h4>
      <div className="space-y-2">
        {steps.map((step) => {
          let state = "pending";
          if (status === step.id) state = "active";
          if (
            status === "done" ||
            steps.findIndex((s) => s.id === status) > steps.findIndex((s) => s.id === step.id)
          ) {
            state = "completed";
          }

          return (
            <div key={step.id} className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  state === "completed"
                    ? "bg-green-500"
                    : state === "active"
                      ? "bg-blue-500 animate-pulse"
                      : "bg-gray-300"
                }`}
              />
              <span
                className={`text-sm ${
                  state === "completed"
                    ? "text-gray-900"
                    : state === "active"
                      ? "text-blue-700 font-medium"
                      : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
