import { describe, it, expect, vi } from "vitest";
import { ExperienceCuratorAgent } from "../src/experience-curator";
import { ModelRouter } from "../src/router";
import { emptyProfile } from "@raah/shared/profile";

describe("P4 Exit Gates", () => {
  it("Anti-preference Test: 'hates crowds' profile avoids peak-slot Amber Fort", async () => {
    const router = new ModelRouter();

    // We mock the LLM to return a non-crowded alternative
    vi.spyOn(router, "generateStructured").mockResolvedValue({
      data: {
        days: [
          {
            date: "2026-10-10",
            energy_rating: "moderate",
            blocks: [
              {
                kind: "experience",
                title: "Nahargarh Fort (Early Morning)",
                time_window: { start: "08:00", end: "10:00" },
                duration_minutes: 120,
                cost_estimate_inr: 500,
                tags: ["History", "Quiet"],
                reasoning_summary:
                  "Chosen instead of Amber Fort to avoid the heavy crowds, aligning with your preference.",
              },
            ],
          },
        ],
      },
    } as any);

    const curator = new ExperienceCuratorAgent(router);
    const profile = emptyProfile();
    // Simulate user selecting an anti-preference
    if (!profile.preferences) {
      profile.preferences = {} as any;
    }
    profile.preferences.anti_preferences = ["crowds"];

    const graph = {
      concept: {
        title: "Jaipur Trip",
        narrative: "",
        region_strategy: "",
        route_skeleton: [],
        discarded_alternatives: [],
      },
      route: [{ node_id: "stop_1", place: { name: "Jaipur" }, nights: 2 }],
      days: [
        { node_id: "day_1", date: "2026-10-10", energy_rating: "moderate", blocks: [], meals: [] },
      ],
      legs: [],
    } as any;

    const result = await curator.curateExperiences(profile, graph.route);

    const day = result.find((d) => d.date === "2026-10-10");
    expect(day?.blocks.length).toBeGreaterThan(0);
    expect(day?.blocks[0].title).not.toContain("Amber Fort");
    expect(day?.blocks[0].reasoning.summary).toContain("avoid the heavy crowds");
  });
});
