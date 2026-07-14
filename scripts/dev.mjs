#!/usr/bin/env node
// One-command local dev: boots docker infra if available, then all apps via turbo.
import { spawn, execSync } from "node:child_process";

function dockerAvailable() {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (dockerAvailable()) {
  console.log("▶ starting docker infra (postgres, redis, minio)…");
  execSync("docker compose -f docker-compose.dev.yml up -d --wait", { stdio: "inherit" });
} else {
  console.warn(
    "⚠ Docker not available — skipping Postgres/Redis/MinIO. " +
      "Apps needing them will fail until you install Docker Desktop or OrbStack.",
  );
}

const turbo = spawn("pnpm", ["exec", "turbo", "run", "dev", "--parallel"], {
  stdio: "inherit",
});
turbo.on("exit", (code) => process.exit(code ?? 0));
