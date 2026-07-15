import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/.ladle/**",
      "**/build/**",
      "Docs/**",
      "packages/db/drizzle/**",
      "**/next-env.d.ts",
    ],
  },
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.int.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // P3–P6 prototype surfaces imported July 2026: `any`-heavy generated code
    // being typed incrementally during phase hardening. Warn (visible in CI
    // logs), don't fail — remove entries from this list as files are typed.
    files: [
      "packages/agents/**",
      "packages/integrations/src/**",
      "evals/src/**",
      "apps/web/src/app/**",
      "apps/web/src/components/**",
      "apps/api/src/routers/**",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // ARCH rule: external HTTP only through packages/integrations adapters.
    // dependency-cruiser catches http-client *imports*; this catches raw global fetch.
    files: ["packages/**/*.ts", "apps/api/**/*.ts", "apps/worker/**/*.ts"],
    ignores: ["packages/integrations/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "External HTTP goes through @raah/integrations adapters only (no-fetch-outside-integrations).",
        },
      ],
    },
  },
  {
    // ARCH rule: all date math via packages/shared/dates (Luxon, IST-aware).
    files: ["packages/**/*.ts", "apps/**/*.ts"],
    ignores: ["packages/shared/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "luxon",
              message: "Use @raah/shared/dates (IST-aware helpers) instead of raw Luxon.",
            },
          ],
        },
      ],
    },
  },
);
