/**
 * In-memory sliding-window rate limiter per client IP.
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests = 15, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Periodically clean up stale records every 2 minutes
    const interval = setInterval(() => this.cleanup(), 120_000);
    if (interval.unref) {
      interval.unref();
    }
  }

  public check(ip: string): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
    const now = Date.now();
    const timestamps = this.requests.get(ip) || [];
    const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);

    if (validTimestamps.length >= this.maxRequests) {
      const oldest = validTimestamps[0];
      const retryAfterSeconds = Math.ceil((oldest + this.windowMs - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    validTimestamps.push(now);
    this.requests.set(ip, validTimestamps);
    return {
      allowed: true,
      remaining: this.maxRequests - validTimestamps.length,
    };
  }

  public reset(): void {
    this.requests.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [ip, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter(ts => now - ts < this.windowMs);
      if (valid.length === 0) {
        this.requests.delete(ip);
      } else {
        this.requests.set(ip, valid);
      }
    }
  }
}
