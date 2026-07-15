import { ProviderAdapter, CachePolicy, Health } from "./adapter";

export interface FxRequest {
  from: string;
  to: string;
}

export interface FxResult {
  rate: number;
}

export class FxAdapter extends ProviderAdapter<FxRequest, any, FxResult> {
  public name = "fx";
  public cachePolicy: CachePolicy = {
    ttlSeconds: 24 * 60 * 60, // 24 hours cache (FX rates change daily typically for free apis)
  };

  protected async fetch(req: FxRequest): Promise<any> {
    // Frankfurter API (free, no key required)
    const url = `https://api.frankfurter.app/latest?from=${req.from.toUpperCase()}&to=${req.to.toUpperCase()}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`FX API error: ${response.statusText}`);
    }
    return response.json();
  }

  public normalize(res: any): FxResult {
    const toCurrency = Object.keys(res.rates)[0];
    if (!toCurrency) throw new Error("No rates found in FX response");
    return {
      rate: res.rates[toCurrency],
    };
  }

  public async healthProbe(): Promise<Health> {
    try {
      const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR");
      if (res.ok) return { status: "ok" };
      return { status: "degraded" };
    } catch {
      return { status: "down" };
    }
  }
}
