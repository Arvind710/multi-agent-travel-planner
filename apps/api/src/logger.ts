import pino from "pino";
import { loadEnv } from "@raah/shared/env";

const env = loadEnv();

import { traceLogMixin } from "@raah/shared/telemetry";

export const logger = pino({
  level: env.LOG_LEVEL,
  mixin: traceLogMixin,
  ...(env.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
  base: { service: "api" },
});
