/**
 * Token Bucket rate limiting algorithm.
 * Each IP+endpoint combination gets a bucket with a fixed number of tokens.
 * Each request consumes one token. Tokens refill at a steady rate.
 * Allows short bursts if tokens have accumulated.
 */
export class TokenBucket {
  /** Create a new TokenBucket instance. */
  constructor() {
    /** @type {Map<string, { tokens: number, lastRefill: number }>} */
    this._buckets = new Map();
  }

  /**
   * Check if a request is allowed under the token bucket algorithm.
   * @param {string} key - Rate limit key (e.g. "192.168.1.5:GET:/getAllUsers")
   * @param {number} limit - Maximum tokens (burst capacity)
   * @param {number} windowSeconds - Refill window duration in seconds
   * @returns {{ allowed: boolean, current: number, limit: number, remaining: number, resetTime: number }}
   */
  check(key, limit, windowSeconds) {
    const now = Date.now();

    if (!this._buckets.has(key)) {
      this._buckets.set(key, { tokens: limit, lastRefill: now });
    }

    const entry = this._buckets.get(key);

    // Refill tokens based on elapsed time
    const elapsedMs = now - entry.lastRefill;
    const refillRate = limit / (windowSeconds * 1000);
    const tokensToAdd = elapsedMs * refillRate;
    entry.tokens = Math.min(limit, entry.tokens + tokensToAdd);
    entry.lastRefill = now;

    if (entry.tokens >= 1) {
      entry.tokens -= 1;
      return {
        allowed: true,
        current: Math.ceil(limit - entry.tokens),
        limit,
        remaining: Math.floor(entry.tokens),
        resetTime: now + (windowSeconds * 1000)
      };
    }

    return {
      allowed: false,
      current: limit,
      limit,
      remaining: 0,
      resetTime: now + Math.ceil((1 - entry.tokens) / refillRate)
    };
  }

  /**
   * Remove entries that haven't been accessed in 2x the window period.
   * Call this periodically to prevent memory leaks.
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this._buckets) {
      if (now - entry.lastRefill > 120_000) {
        this._buckets.delete(key);
      }
    }
  }
}
