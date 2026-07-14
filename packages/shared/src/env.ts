import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Single Zod-validated view of process.env (implementation-plan §0.2).
 * Everything has a dev default except real secrets, which stay optional
 * and are asserted by the code paths that need them.
 */
const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().default("postgres://raah:raah@localhost:5432/raah"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_ACCESS_KEY_ID: z.string().default("raah"),
  S3_SECRET_ACCESS_KEY: z.string().default("raah-dev-secret"),
  S3_BUCKET: z.string().default("raah-dev"),

  API_PORT: z.coerce.number().int().positive().default(4000),
  API_URL: z.string().default("http://localhost:4000"),
  WEB_URL: z.string().default("http://localhost:3000"),
  PROVIDER_MOCKS_URL: z.string().default("http://localhost:4010"),

  AUTH_SECRET: z.string().default("dev-secret-change-me"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  AUTH_RESEND_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Raah <onboarding@resend.dev>"),

  PLAN_GENERATE_CONCURRENCY: z.coerce.number().int().positive().default(1),
  PLAN_REVISE_CONCURRENCY: z.coerce.number().int().positive().default(2),
  PLAN_EXPORT_CONCURRENCY: z.coerce.number().int().positive().default(1),
  WATCH_PRICE_CONCURRENCY: z.coerce.number().int().positive().default(1),
  KB_INGEST_CONCURRENCY: z.coerce.number().int().positive().default(1),
  NOTIFY_CONCURRENCY: z.coerce.number().int().positive().default(2),
  PLAN_TOKEN_BUDGET: z.coerce.number().int().positive().default(250_000),

  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().default("https://cloud.langfuse.com"),
  OTEL_ENABLED: boolFromString,
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Load the repo-root .env into process.env (real env always wins).
 * Next.js does this natively; the tsx-run apps (api, worker, mocks) need it here.
 * Walks up from cwd so it works from any package directory.
 */
function loadDotenvFile(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const file = path.join(dir, ".env");
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed
          .slice(eq + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        if (!(key in process.env)) process.env[key] = value;
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

let cached: Env | undefined;

/** Parse (once) and return the validated environment. Throws with a readable report on invalid env. */
export function loadEnv(): Env {
  if (!cached) {
    loadDotenvFile();
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test helper: clear the cache so a test can vary process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
