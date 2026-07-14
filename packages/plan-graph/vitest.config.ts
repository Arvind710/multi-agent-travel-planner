import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Property suites run 1k (PR) / 10k (nightly) cases via FC_NUM_RUNS.
    testTimeout: 600_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Test tooling (builders/fixtures) is exercised BY tests, not covered by them.
      exclude: ["src/testing/**", "src/**/*.test.ts"],
      // Testing floor per implementation-plan §0.3: plan-graph ≥95%.
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 85 },
    },
  },
});
