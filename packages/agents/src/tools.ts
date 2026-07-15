import { z } from "zod";
import { tool } from "ai";
// In a real implementation, we would import from @raah/integrations.
// For now we will create stub implementations that we can replace later.

export const kbLookup = tool({
  description: "Look up a specific entity by kind and slug in the knowledge base.",
  parameters: z.object({
    kind: z.string().describe("The kind of entity, e.g. 'monument', 'park', 'region'"),
    slug: z.string().describe("The slug of the entity to look up"),
  }),
  execute: async ({ kind, slug }: { kind: string; slug: string }) => {
    // Stub implementation
    return { id: `${kind}-${slug}`, found: true };
  },
} as any);

export const kbSearch = tool({
  description: "Search for entities in the knowledge base.",
  parameters: z.object({
    query: z.string().describe("Search query string"),
    filters: z.record(z.string(), z.string()).optional(),
  }),
  execute: async ({ query }: { query: string }) => {
    // Stub implementation
    return { results: [{ id: "stub-result", match: query }] };
  },
} as any);

export const mapsDistanceMatrix = tool({
  description: "Get travel distance and realistic travel time between two places.",
  parameters: z.object({
    origins: z.array(z.string()),
    destinations: z.array(z.string()),
    mode: z.enum(["driving", "walking", "transit", "bicycling"]).default("driving"),
  }),
  execute: async (_args: { origins: string[]; destinations: string[] }) => {
    return { duration_minutes: 120, distance_km: 100 };
  },
} as any);

export const railSchedule = tool({
  description: "Look up train schedules between two stations in India.",
  parameters: z.object({
    from: z.string(),
    to: z.string(),
    date: z.string().describe("ISO date YYYY-MM-DD"),
  }),
  execute: async (_args: any) => {
    return { trains: [] };
  },
} as any);

export const hotelsSearch = tool({
  description: "Search for hotels in a specific place.",
  parameters: z.object({
    place: z.string(),
    check_in: z.string(),
    check_out: z.string(),
    guests: z.number().default(2),
  }),
  execute: async (_args: any) => {
    return { hotels: [] };
  },
} as any);

export const flightsSearch = tool({
  description: "Search for flights between two airports.",
  parameters: z.object({
    origin: z.string(),
    destination: z.string(),
    date: z.string(),
  }),
  execute: async (_args: any) => {
    return { flights: [] };
  },
} as any);

export const weatherNormals = tool({
  description: "Get historical weather normals for a place and month.",
  parameters: z.object({
    place: z.string(),
    month: z.number().min(1).max(12),
  }),
  execute: async (_args: any) => {
    return { high_c: 30, low_c: 20, rain_mm: 5 };
  },
} as any);

export const fxRate = tool({
  description: "Get the current exchange rate from a currency to INR.",
  parameters: z.object({
    from_currency: z.string().length(3),
  }),
  execute: async (_args: any) => {
    return { rate_to_inr: 85 }; // Stub for e.g. USD
  },
} as any);

export const allTools: Record<string, any> = {
  kbLookup,
  kbSearch,
  mapsDistanceMatrix,
  railSchedule,
  hotelsSearch,
  flightsSearch,
  weatherNormals,
  fxRate,
};
