import { afterEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "./env";

describe("env", () => {
  afterEach(() => {
    resetEnvCache();
    delete process.env.API_PORT;
    delete process.env.OTEL_ENABLED;
  });

  it("provides dev defaults", () => {
    const env = loadEnv();
    expect(env.DATABASE_URL).toContain("postgres://");
    expect(env.API_PORT).toBe(4000);
    expect(env.PLAN_TOKEN_BUDGET).toBe(250_000);
  });

  it("coerces numbers and booleans from strings", () => {
    process.env.API_PORT = "5001";
    process.env.OTEL_ENABLED = "true";
    resetEnvCache();
    const env = loadEnv();
    expect(env.API_PORT).toBe(5001);
    expect(env.OTEL_ENABLED).toBe(true);
  });

  it("rejects invalid values with a readable error", () => {
    process.env.API_PORT = "not-a-port";
    resetEnvCache();
    expect(() => loadEnv()).toThrow(/Invalid environment/);
  });
});
