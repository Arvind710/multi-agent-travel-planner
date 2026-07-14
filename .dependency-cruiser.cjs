/** Boundary rules (implementation-plan §0.1, CI-enforced). */
module.exports = {
  forbidden: [
    {
      name: "no-llm-in-deterministic",
      comment:
        "packages/constraints, plan-graph, db are deterministic-only: no LLM SDKs, no agents (ARCH §0.3, §7.3)",
      severity: "error",
      from: { path: "^packages/(constraints|plan-graph|db)/" },
      to: {
        path: "(^packages/agents/|node_modules/(ai|openai|@openai|@google/genai|@google/generative-ai|@anthropic-ai|groq-sdk|@mistralai|langchain|@langchain))",
      },
    },
    {
      name: "no-fetch-outside-integrations",
      comment:
        "HTTP client libraries only inside packages/integrations (ARCH §10); raw fetch caught by ESLint",
      severity: "error",
      from: { path: "^(packages|apps)/", pathNot: "^packages/integrations/" },
      to: { path: "node_modules/(axios|got|node-fetch|ky|superagent|request)($|/)" },
    },
    {
      name: "no-cross-app-imports",
      comment: "apps never import from other apps; shared code lives in packages",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    exclude: { path: "(\\.(test|spec)\\.tsx?$|/build/|/dist/|/\\.next/)" },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
