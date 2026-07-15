import { createDb } from "@raah/db";
import { loadEnv } from "@raah/shared/env";

const env = loadEnv();

/** Server-side db handle for RSC pages (same pattern as auth.ts). */
export const { db } = createDb(env.DATABASE_URL);
