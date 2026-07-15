import { ProviderAdapter, CachePolicy, Health } from "./adapter";

export interface AqiRequest {
  latitude: number;
  longitude: number;
}

export interface AqiResult {
  aqi: number;
  category: string;
}

export class AqiAdapter extends ProviderAdapter<AqiRequest, any, AqiResult> {
  public name = "aqi";
  public cachePolicy: CachePolicy = {
    ttlSeconds: 60 * 60, // 1 hour cache
  };

  protected async fetch(req: AqiRequest): Promise<any> {
    // For free bootstrap without keys, we might use Open-Meteo's Air Quality API
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${req.latitude}&longitude=${req.longitude}&current=us_aqi`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`AQI API error: ${response.statusText}`);
    }
    return response.json();
  }

  public normalize(res: any): AqiResult {
    const aqi = res.current.us_aqi;
    let category = "Good";
    if (aqi > 50) category = "Moderate";
    if (aqi > 100) category = "Unhealthy for Sensitive Groups";
    if (aqi > 150) category = "Unhealthy";
    if (aqi > 200) category = "Very Unhealthy";
    if (aqi > 300) category = "Hazardous";

    return {
      aqi,
      category,
    };
  }

  public async healthProbe(): Promise<Health> {
    try {
      const res = await fetch(
        "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=52.52&longitude=13.41&current=us_aqi",
      );
      if (res.ok) return { status: "ok" };
      return { status: "degraded" };
    } catch {
      return { status: "down" };
    }
  }
}
