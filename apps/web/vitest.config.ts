import { defineConfig } from "vitest/config";

// Playwright e2e specs run via `playwright test`, never vitest.
export default defineConfig({
  test: {
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    passWithNoTests: true,
  },
});
