import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      // Testing floor per implementation-plan §0.3: constraints ≥95%.
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 85 },
    },
  },
});
