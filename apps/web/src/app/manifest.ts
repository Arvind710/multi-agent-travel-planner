import type { MetadataRoute } from "next";

/** PWA manifest stub (P0.12) — icons + offline behavior arrive in P8.1. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Raah — India trip planner",
    short_name: "Raah",
    description: "AI-planned, deeply reasoned travel itineraries for India.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#b3432b",
    icons: [],
  };
}
