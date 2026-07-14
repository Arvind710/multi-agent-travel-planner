import { describe, expect, it } from "vitest";
import { appError, err, isErr, isOk, mapResult, ok, tryResult, unwrap } from "./result";

describe("Result / AppError", () => {
  it("ok/err narrow correctly", () => {
    const good = ok(42);
    const bad = err(appError("not_found", "missing"));
    expect(isOk(good)).toBe(true);
    expect(isErr(bad)).toBe(true);
    if (isOk(good)) expect(good.value).toBe(42);
    if (isErr(bad)) expect(bad.error.code).toBe("not_found");
  });

  it("mapResult transforms only success", () => {
    expect(mapResult(ok(2), (n) => n * 2)).toEqual(ok(4));
    const e = err(appError("internal", "boom"));
    expect(mapResult(e, (n: number) => n * 2)).toBe(e);
  });

  it("unwrap returns value or throws", () => {
    expect(unwrap(ok("x"))).toBe("x");
    expect(() => unwrap(err(appError("internal", "boom")))).toThrow();
  });

  it("tryResult converts throws into AppError results", async () => {
    const good = await tryResult(async () => 7);
    expect(good).toEqual(ok(7));
    const bad = await tryResult(async () => {
      throw new Error("provider down");
    }, "provider_unavailable");
    expect(isErr(bad) && bad.error.code).toBe("provider_unavailable");
    expect(isErr(bad) && bad.error.message).toBe("provider down");
  });
});
