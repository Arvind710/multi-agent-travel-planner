import { fileURLToPath } from "node:url";
import { buildPipeline } from "@raah/agents";
import { KnowledgeBase } from "@raah/kb";
import { emptyProfile } from "@raah/shared/profile";

// children holds ages (profile schema), not a head-count
const DEMO_BRIEFS = [
  { city: "Jaipur", adults: 2, children: [8], vibe: "relaxed family" },
  { city: "Kochi", adults: 2, children: [], vibe: "honeymoon" },
  { city: "Delhi", adults: 1, children: [], vibe: "solo budget" },
  { city: "Mumbai", adults: 4, children: [], vibe: "friends food trip" },
  { city: "Leh", adults: 2, children: [], vibe: "adventure" },
];

export async function runDemo() {
  console.log("Setting up internal demo...");
  const kb = await KnowledgeBase.fromContent(
    fileURLToPath(new URL("../../content/kb", import.meta.url)),
  );
  const _pipeline = buildPipeline({ kb }); // invoked once briefs run against a configured LLM

  for (const brief of DEMO_BRIEFS) {
    const p = emptyProfile();
    p.trip.origin.city = brief.city;
    p.party.adults = brief.adults;
    p.party.children = brief.children;
    console.log(`Prepared demo brief: ${brief.city} - ${brief.vibe}`);
  }

  console.log("Internal demo seeded. Feedback capture form link: https://forms.example.com/demo");
}

if (process.argv[1] && process.argv[1].endsWith("demo.ts")) {
  runDemo().catch(console.error);
}
