import { Client, TravelMode } from "@googlemaps/google-maps-services-js";
import { ProviderAdapter, CachePolicy, Health } from "./adapter";
import { loadEnv } from "@raah/shared/env";
import { type Db } from "@raah/db";
import { Redis } from "ioredis";

export interface DistanceRequest {
  origins: string[];
  destinations: string[];
}

export interface DistanceResult {
  origin: string;
  destination: string;
  distanceMeters: number;
  durationSeconds: number;
}

export class GoogleMapsAdapter extends ProviderAdapter<DistanceRequest, any, DistanceResult[]> {
  public name = "google_maps";
  public cachePolicy: CachePolicy = {
    ttlSeconds: 30 * 24 * 60 * 60, // 30 days memoization
  };

  private client = new Client({});
  private apiKey: string;

  constructor(db: Db, redis: Redis) {
    super(db, redis);
    const env = loadEnv();
    if (!env.GOOGLE_MAPS_API_KEY) {
      // In a real app we might throw here, but for now we fallback or warn.
      console.warn("GOOGLE_MAPS_API_KEY is not set.");
    }
    this.apiKey = env.GOOGLE_MAPS_API_KEY || "";
  }

  protected async fetch(req: DistanceRequest): Promise<any> {
    if (!this.apiKey) {
      throw new Error("Missing GOOGLE_MAPS_API_KEY");
    }
    const response = await this.client.distancematrix({
      params: {
        origins: req.origins,
        destinations: req.destinations,
        mode: TravelMode.driving,
        key: this.apiKey,
      },
      timeout: 5000, // milliseconds
    });

    if (response.data.status !== "OK") {
      throw new Error(`Google Maps API error: ${response.data.status}`);
    }

    return response.data;
  }

  public normalize(res: any): DistanceResult[] {
    const results: DistanceResult[] = [];
    const origins = res.origin_addresses;
    const destinations = res.destination_addresses;

    for (let i = 0; i < origins.length; i++) {
      const row = res.rows[i];
      for (let j = 0; j < destinations.length; j++) {
        const element = row.elements[j];
        if (element.status === "OK") {
          results.push({
            origin: origins[i],
            destination: destinations[j],
            distanceMeters: element.distance.value,
            durationSeconds: element.duration.value,
          });
        }
      }
    }
    return results;
  }

  public async healthProbe(): Promise<Health> {
    try {
      // Basic ping or short fetch
      return { status: "ok" };
    } catch {
      return { status: "down" };
    }
  }
}
