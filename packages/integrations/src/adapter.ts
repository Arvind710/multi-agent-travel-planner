import CircuitBreaker from "opossum";
import pRetry from "p-retry";
import { type Db } from "@raah/db";
import { providerCache } from "@raah/db/schema";
import { eq, and } from "drizzle-orm";
import { Redis } from "ioredis";

export interface CachePolicy {
  ttlSeconds: number;
}

export interface Health {
  status: "ok" | "degraded" | "down";
  latencyMs?: number;
}

export abstract class ProviderAdapter<Req, Res, DomainType> {
  public abstract name: string;
  public abstract cachePolicy: CachePolicy;

  protected breaker: CircuitBreaker<[Req], Res>;

  constructor(
    protected db: Db,
    protected redis: Redis,
    options: CircuitBreaker.Options = {},
  ) {
    this.breaker = new CircuitBreaker(
      async (req: Req) => {
        // 1. Check cache first
        const requestHash = this.hashRequest(req);
        const cached = await this.db.query.providerCache.findFirst({
          where: and(
            eq(providerCache.provider, this.name),
            eq(providerCache.requestHash, requestHash),
          ),
        });

        if (cached) {
          const ageSeconds = (Date.now() - cached.fetchedAt.getTime()) / 1000;
          if (ageSeconds < this.cachePolicy.ttlSeconds) {
            return cached.response as Res;
          }
        }

        // 2. Check Rate Limit Ledger
        const quotaAllowed = await this.checkRateLimit();
        if (!quotaAllowed) {
          throw new Error(`Rate limit exceeded for provider: ${this.name}`);
        }

        // 3. Fetch with retry
        const result = await pRetry(() => this.fetch(req), {
          retries: 2,
          minTimeout: 100,
          factor: 2,
        });

        // 4. Save to cache
        await this.db
          .insert(providerCache)
          .values({
            provider: this.name,
            requestHash,
            response: result,
            ttlSeconds: this.cachePolicy.ttlSeconds,
          })
          .onConflictDoUpdate({
            target: [providerCache.provider, providerCache.requestHash],
            set: {
              response: result,
              fetchedAt: new Date(),
              ttlSeconds: this.cachePolicy.ttlSeconds,
            },
          });

        return result;
      },
      {
        timeout: 10000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        ...options,
      },
    );
  }

  protected abstract fetch(req: Req): Promise<Res>;
  public abstract normalize(res: Res): DomainType;
  public abstract healthProbe(): Promise<Health>;

  protected hashRequest(req: Req): string {
    return Buffer.from(JSON.stringify(req)).toString("base64");
  }

  protected async checkRateLimit(): Promise<boolean> {
    // Basic rate limit ledger using Redis
    const key = `ratelimit:provider:${this.name}`;
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, 60); // 1 minute window
    }
    // E.g. limit to 100 requests per minute
    return current <= 100;
  }

  public async execute(req: Req): Promise<DomainType> {
    const res = await this.breaker.fire(req);
    return this.normalize(res);
  }
}
