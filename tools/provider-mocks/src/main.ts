import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";

/**
 * Deterministic provider mock server (P0.10).
 * Contract: response SHAPES match what the real adapters in packages/integrations
 * will normalize, so swapping mock→live (P7) is adapter config, not code change.
 * Known inputs come from fixtures; unknown inputs get hash-derived deterministic
 * values — the same query always returns the same answer, offline, forever.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(path.join(here, "../fixtures", `${name}.json`), "utf8")) as T;

const distanceMatrix = fixture<Record<string, unknown>>("distance-matrix");
const rail = fixture<Record<string, unknown[]>>("rail");
const hotels = fixture<Record<string, unknown[]>>("hotels");
const weather = fixture<Record<string, Record<string, unknown>>>("weather");

/** Stable pseudo-random in [min, max) derived from the input string. */
function hashNum(input: string, min: number, max: number): number {
  const h = createHash("sha256").update(input).digest();
  const unit = h.readUInt32BE(0) / 0xffffffff;
  return min + unit * (max - min);
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, "-");

const app = Fastify({ logger: false });

app.get("/health", async () => ({ status: "ok", service: "provider-mocks" }));

app.get<{ Querystring: { origin: string; destination: string; mode?: string } }>(
  "/maps/distance-matrix",
  async (req) => {
    const { origin, destination, mode = "drive" } = req.query;
    const key = `${norm(origin)}|${norm(destination)}|${mode}`;
    const reverseKey = `${norm(destination)}|${norm(origin)}|${mode}`;
    const known = distanceMatrix[key] ?? distanceMatrix[reverseKey];
    if (known) return { source: "fixture", ...known };
    const km = Math.round(hashNum(key, 60, 900));
    return {
      source: "deterministic-fallback",
      distance_km: km,
      duration_hours: Math.round((km / 55) * 10) / 10,
      route_note: "estimated",
    };
  },
);

app.get<{ Querystring: { query: string } }>("/maps/places", async (req) => {
  const q = norm(req.query.query ?? "");
  return {
    results: [
      {
        place_id: `mock_${q}`,
        name: req.query.query,
        location: { lat: hashNum(`${q}lat`, 8, 34), lng: hashNum(`${q}lng`, 68, 96) },
        rating: Math.round(hashNum(`${q}r`, 35, 49)) / 10,
      },
    ],
  };
});

app.get<{ Querystring: { from: string; to: string } }>("/rail/schedule", async (req) => {
  const key = `${norm(req.query.from)}|${norm(req.query.to)}`;
  return { trains: rail[key] ?? [], booking_window_days: 60 };
});

app.get<{ Querystring: { city: string } }>("/hotels/search", async (req) => {
  const city = norm(req.query.city ?? "");
  return { hotels: hotels[city] ?? [] };
});

app.get<{ Querystring: { from: string; to: string; date?: string } }>(
  "/flights/search",
  async (req) => {
    const key = `${norm(req.query.from)}|${norm(req.query.to)}`;
    return {
      flights: [
        {
          carrier: "6E",
          number: `6E${Math.round(hashNum(key, 100, 999))}`,
          departs: "09:20",
          arrives: "11:05",
          fare_inr_estimate: Math.round(hashNum(`${key}fare`, 3200, 9800)),
          estimate: true,
        },
      ],
    };
  },
);

app.get<{ Querystring: { region: string; month: string } }>("/weather/normals", async (req) => {
  const region = norm(req.query.region ?? "");
  const month = String(Number(req.query.month ?? "1"));
  const known = weather[region]?.[month];
  if (known) return { source: "fixture", ...known };
  return {
    source: "deterministic-fallback",
    high_c: Math.round(hashNum(`${region}${month}h`, 18, 38)),
    low_c: Math.round(hashNum(`${region}${month}l`, 5, 25)),
    rain_mm: Math.round(hashNum(`${region}${month}r`, 0, 300)),
    note: "estimated",
  };
});

app.get<{ Querystring: { city: string } }>("/aqi", async (req) => {
  const city = norm(req.query.city ?? "");
  return { city, aqi: Math.round(hashNum(`${city}aqi`, 40, 320)) };
});

app.get<{ Querystring: { base?: string; quote?: string } }>("/fx", async (req) => {
  const base = (req.query.base ?? "USD").toUpperCase();
  const quote = (req.query.quote ?? "INR").toUpperCase();
  return { base, quote, rate: Math.round(hashNum(`${base}${quote}`, 20, 110) * 100) / 100 };
});

const port = Number(process.env.PROVIDER_MOCKS_PORT ?? 4010);
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => console.log(`[provider-mocks] listening on :${port}`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
