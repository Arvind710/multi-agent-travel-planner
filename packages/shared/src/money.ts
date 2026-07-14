import { z } from "zod";

/**
 * Money as {amount, currency} with INR-first formatting (lakh/crore grouping).
 * Amounts are plain currency units (₹, not paise) — plan-level estimates, not payments.
 */
export const CurrencyCode = z.enum(["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED", "JPY"]);
export type CurrencyCode = z.infer<typeof CurrencyCode>;

export const Money = z.object({
  amount: z.number().finite(),
  currency: CurrencyCode,
});
export type Money = z.infer<typeof Money>;

export function inr(amount: number): Money {
  return { amount, currency: "INR" };
}

/** "₹12,34,567" — en-IN grouping gives lakh/crore automatically. */
export function formatMoney(money: Money, locale = "en-IN"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    maximumFractionDigits: 0,
  }).format(money.amount);
}

/** Compact Indian style for prose: "₹3.5 L", "₹1.2 Cr". Non-INR falls back to Intl compact. */
export function formatINRCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${trimTrailingZero((abs / 1_00_00_000).toFixed(1))} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${trimTrailingZero((abs / 1_00_000).toFixed(1))} L`;
  return formatMoney(inr(amount));
}

function trimTrailingZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add ${a.currency} and ${b.currency} without an FX conversion`);
  }
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function sumMoney(items: Money[], currency: CurrencyCode = "INR"): Money {
  return items.reduce(addMoney, { amount: 0, currency });
}

/** FX conversion with an explicit rate (rates come from the fx adapter, never hardcoded). */
export function convert(money: Money, to: CurrencyCode, rate: number): Money {
  return { amount: money.amount * rate, currency: to };
}
