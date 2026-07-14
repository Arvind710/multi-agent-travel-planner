import { describe, expect, it } from "vitest";
import { addMoney, convert, formatINRCompact, formatMoney, inr, sumMoney } from "./money.js";

describe("money (INR-first)", () => {
  it("formats INR with lakh/crore grouping (en-IN)", () => {
    expect(formatMoney(inr(1234567))).toBe("₹12,34,567");
    expect(formatMoney(inr(350000))).toBe("₹3,50,000");
  });

  it("formats compact Indian units", () => {
    expect(formatINRCompact(350000)).toBe("₹3.5 L");
    expect(formatINRCompact(12000000)).toBe("₹1.2 Cr");
    expect(formatINRCompact(100000)).toBe("₹1 L");
    expect(formatINRCompact(9999)).toBe("₹9,999");
  });

  it("adds same-currency money and rejects cross-currency addition", () => {
    expect(addMoney(inr(100), inr(250))).toEqual(inr(350));
    expect(() => addMoney(inr(100), { amount: 5, currency: "USD" })).toThrow(/FX conversion/);
  });

  it("sums a ledger", () => {
    expect(sumMoney([inr(100), inr(200), inr(300)])).toEqual(inr(600));
    expect(sumMoney([])).toEqual(inr(0));
  });

  it("converts with an explicit rate", () => {
    expect(convert({ amount: 100, currency: "GBP" }, "INR", 105)).toEqual(inr(10500));
  });
});
