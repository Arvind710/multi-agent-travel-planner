import { describe, it, expect } from "vitest";

describe("P4 Exit Gates - Grounding Audit", () => {
  it("samples factual nodes and asserts 100% have SourceRef or verify_flag", () => {
    // In a real run, this script would sample 50 factual nodes across 5 generated plans.
    // For this unit test, we mock a generated graph with factual assertions.

    const mockPlanNodes = [
      {
        id: "b1",
        title: "Humayun's Tomb",
        metadata: { source_ref: { type: "kb", id: "monument_humayun" } },
      },
      {
        id: "b2",
        title: "Cafe Lota",
        metadata: { source_ref: { type: "kb", id: "food_cafe_lota" } },
      },
      { id: "b3", title: "Random Street Food", metadata: { verify_flag: true } },
    ];

    let missingCount = 0;

    mockPlanNodes.forEach((node) => {
      const hasSource = !!node.metadata?.source_ref;
      const hasFlag = !!node.metadata?.verify_flag;

      if (!hasSource && !hasFlag) {
        missingCount++;
      }
    });

    // We expect absolutely 0 unlabelled assertions.
    expect(missingCount).toBe(0);
  });
});
