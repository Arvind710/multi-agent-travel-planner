import { describe, expect, it } from "vitest";
import {
  addDays,
  dateRange,
  daysBetween,
  formatISTDate,
  istNow,
  monthOf,
  overlaps,
  toIST,
} from "./dates.js";

describe("dates (IST-aware)", () => {
  it("istNow is anchored to Asia/Kolkata (+05:30, no DST)", () => {
    expect(istNow().offset).toBe(330);
  });

  it("toIST throws on garbage", () => {
    expect(() => toIST("not-a-date")).toThrow(/Invalid ISO date/);
  });

  it("dateRange is inclusive on both ends", () => {
    expect(dateRange("2026-12-05", "2026-12-07")).toEqual([
      "2026-12-05",
      "2026-12-06",
      "2026-12-07",
    ]);
    expect(dateRange("2026-12-05", "2026-12-05")).toEqual(["2026-12-05"]);
  });

  it("dateRange rejects inverted ranges", () => {
    expect(() => dateRange("2026-12-07", "2026-12-05")).toThrow(/before start/);
  });

  it("dateRange crosses month/year boundaries", () => {
    expect(dateRange("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("daysBetween counts whole days, end-exclusive", () => {
    expect(daysBetween("2026-12-05", "2026-12-07")).toBe(2);
    expect(daysBetween("2026-12-05", "2026-12-05")).toBe(0);
  });

  it("overlaps handles disjoint, touching, and contained ranges", () => {
    expect(overlaps("2026-12-01", "2026-12-05", "2026-12-06", "2026-12-10")).toBe(false);
    expect(overlaps("2026-12-01", "2026-12-05", "2026-12-05", "2026-12-10")).toBe(true); // shared day
    expect(overlaps("2026-12-01", "2026-12-31", "2026-12-14", "2026-12-16")).toBe(true); // contained
  });

  it("monthOf and addDays", () => {
    expect(monthOf("2026-12-05")).toBe(12);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("formatISTDate renders a readable date", () => {
    expect(formatISTDate("2026-12-05")).toMatch(/5 Dec 2026/);
  });
});
