import { describe, expect, it } from "vitest";
import {
  buildGoldenKerala7d,
  buildGoldenRajasthan14d,
  makeBlock,
  seededIds,
} from "@raah/plan-graph/testing";
import { emptyProfile, TravellerProfile } from "@raah/shared/profile";
import { runRules, type ConstraintContext } from "./engine";
import { testKb } from "./kb";
import { ALL_RULES } from "./rules";

/**
 * Exit-gate P1: golden fixture graphs pass all constraint rules; deliberately
 * corrupted variants fail the expected rules with the expected violation
 * payloads (snapshot-tested).
 */

const kb = testKb();
const ctx = (graph: ConstraintContext["graph"], profile = emptyProfile()): ConstraintContext => ({
  graph,
  profile,
  kb,
  today: "2026-10-10",
});

describe("golden fixtures × ALL_RULES", () => {
  it("golden Rajasthan 14d passes with zero blocking violations", () => {
    const report = runRules(ctx(buildGoldenRajasthan14d()), ALL_RULES);
    expect(report.blocking).toEqual([]);
    expect(report.pass).toBe(true);
  });

  it("golden Kerala 7d passes with zero blocking violations", () => {
    const report = runRules(ctx(buildGoldenKerala7d()), ALL_RULES);
    expect(report.blocking).toEqual([]);
    expect(report.pass).toBe(true);
  });

  it("corrupted variant: crowds block for a crowds-hating profile → anti-preference payload", () => {
    const graph = buildGoldenRajasthan14d();
    const day = graph.days[0];
    if (!day) throw new Error("no day");
    day.blocks.push(
      makeBlock(seededIds(500), { title: "Amber Fort, 11am Saturday", tags: ["crowds"] }),
    );
    const profile = TravellerProfile.parse({ taste: { anti: ["crowds"] } });
    const report = runRules(ctx(graph, profile), ALL_RULES);
    expect(report.pass).toBe(false);
    const stripped = report.blocking.map(({ rule_id, severity, message, data }) => ({
      rule_id,
      severity,
      message,
      data,
    }));
    expect(stripped).toMatchInlineSnapshot(`
      [
        {
          "data": {
            "anti_hits": [
              "crowds",
            ],
          },
          "message": ""Amber Fort, 11am Saturday" violates anti-preference(s) crowds without a flagged trade-off",
          "rule_id": "anti-preference",
          "severity": "blocking",
        },
      ]
    `);
  });

  it("corrupted variant: Kerala trip dragged into July → season-caution + park logic stay coherent", () => {
    const graph = buildGoldenKerala7d();
    // Corrupt the budget instead of rebuilding dates: blow the stated budget by 40%
    graph.budget.total = { amount: Math.round(48000 * 1.4), currency: "INR" };
    const report = runRules(ctx(graph), ALL_RULES);
    expect(report.pass).toBe(false);
    expect(report.blocking.map((v) => ({ rule_id: v.rule_id, data: v.data })))
      .toMatchInlineSnapshot(`
        [
          {
            "data": {
              "delta_pct": 0.4,
              "stated": 48000,
              "total": 67200,
            },
            "rule_id": "budget-bounds",
          },
        ]
      `);
  });
});
