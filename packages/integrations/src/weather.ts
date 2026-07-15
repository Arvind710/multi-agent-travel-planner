import { ProviderAdapter, CachePolicy, Health } from "./adapter";

export interface WeatherRequest {
  latitude: number;
  longitude: number;
}

export interface WeatherResult {
  temperature: number;
  windspeed: number;
  weathercode: number;
}

export class OpenMeteoAdapter extends ProviderAdapter<WeatherRequest, any, WeatherResult> {
  public name = "open_meteo";
  public cachePolicy: CachePolicy = {
    ttlSeconds: 60 * 60, // 1 hour cache
  };

  protected async fetch(req: WeatherRequest): Promise<any> {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${req.latitude}&longitude=${req.longitude}&current_weather=true`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo API error: ${response.statusText}`);
    }
    return response.json();
  }

  public normalize(res: any): WeatherResult {
    return {
      temperature: res.current_weather.temperature,
      windspeed: res.current_weather.windspeed,
      weathercode: res.current_weather.weathercode,
    };
  }

  public async healthProbe(): Promise<Health> {
    try {
      const res = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current_weather=true",
      );
      if (res.ok) return { status: "ok" };
      return { status: "degraded" };
    } catch {
      return { status: "down" };
    }
  }
}
