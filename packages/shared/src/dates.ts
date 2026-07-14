import { DateTime, Interval } from "luxon";

/**
 * ALL date/time logic in domain code goes through this module (implementation-plan §0.1 rule 7).
 * Raw `new Date()` arithmetic and direct Luxon imports are lint-banned elsewhere.
 * Everything is IST-anchored: India has one timezone, no DST.
 */
export const IST = "Asia/Kolkata";

/** An ISO calendar date, e.g. "2026-12-05". The repo-wide date currency. */
export type ISODate = string;

export function istNow(): DateTime {
  return DateTime.now().setZone(IST);
}

/** Today's ISO date in IST (not the machine's zone — matters for late-night UTC boundaries). */
export function istToday(): ISODate {
  return istNow().toISODate() as ISODate;
}

/** Parse an ISO date/datetime string into an IST DateTime. Throws on invalid input. */
export function toIST(iso: string): DateTime {
  const dt = DateTime.fromISO(iso, { zone: IST });
  if (!dt.isValid) throw new Error(`Invalid ISO date: "${iso}" (${dt.invalidReason})`);
  return dt;
}

/** Inclusive range of ISO dates: dateRange("2026-12-05","2026-12-07") → 3 entries. */
export function dateRange(startISO: ISODate, endISO: ISODate): ISODate[] {
  const start = toIST(startISO).startOf("day");
  const end = toIST(endISO).startOf("day");
  if (end < start) throw new Error(`dateRange: end ${endISO} before start ${startISO}`);
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    out.push(d.toISODate() as ISODate);
  }
  return out;
}

/** Whole days from a to b (b exclusive): daysBetween("2026-12-05","2026-12-07") → 2. */
export function daysBetween(aISO: ISODate, bISO: ISODate): number {
  return toIST(bISO).startOf("day").diff(toIST(aISO).startOf("day"), "days").days;
}

/** Do two inclusive date ranges overlap? */
export function overlaps(
  aStart: ISODate,
  aEnd: ISODate,
  bStart: ISODate,
  bEnd: ISODate,
): boolean {
  const a = Interval.fromDateTimes(toIST(aStart).startOf("day"), toIST(aEnd).endOf("day"));
  const b = Interval.fromDateTimes(toIST(bStart).startOf("day"), toIST(bEnd).endOf("day"));
  return a.overlaps(b);
}

/** Add days to an ISO date. */
export function addDays(iso: ISODate, days: number): ISODate {
  return toIST(iso).plus({ days }).toISODate() as ISODate;
}

/** Month (1–12) of an ISO date — used by season-window / climate rules. */
export function monthOf(iso: ISODate): number {
  return toIST(iso).month;
}

/** Human format in IST, e.g. "Sat, 5 Dec 2026". */
export function formatISTDate(iso: ISODate, locale = "en-IN"): string {
  return toIST(iso).setLocale(locale).toFormat("ccc, d LLL yyyy");
}

/** Escape hatch for UI-layer libraries that need a JS Date. Domain code must not use it. */
export function toJSDate(iso: string): Date {
  return toIST(iso).toJSDate();
}
