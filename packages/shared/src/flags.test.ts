import { afterEach, describe, expect, it } from "vitest";
import { loadFlags, resetFlagsCache } from "./flags";

describe("feature flags", () => {
  afterEach(() => {
    resetFlagsCache();
    delete process.env.FLAG_PROVIDER_MAPS_LIVE;
    delete process.env.FLAG_MODEL_CRITIC_PAID;
  });

  it("bootstrap defaults: live providers off, paid critic on", () => {
    const flags = loadFlags();
    expect(flags.provider.mapsLive).toBe(false);
    expect(flags.model.criticPaid).toBe(true);
    expect(flags.features.priceWatch).toBe(false);
  });

  it("env vars override (camelCase → SCREAMING_SNAKE)", () => {
    process.env.FLAG_PROVIDER_MAPS_LIVE = "true";
    process.env.FLAG_MODEL_CRITIC_PAID = "false";
    resetFlagsCache();
    const flags = loadFlags();
    expect(flags.provider.mapsLive).toBe(true);
    expect(flags.model.criticPaid).toBe(false);
  });

  it("caches until reset", () => {
    const first = loadFlags();
    process.env.FLAG_PROVIDER_MAPS_LIVE = "true";
    expect(loadFlags()).toBe(first);
  });
});
