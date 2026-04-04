/**
 * Sliding Window Log rate limiting algorithm.
 * Stores the timestamp of every request per IP+endpoint.
 * Counts how many timestamps fall within the current window.
 * Stricter than token bucket — no bursts allowed.
 */
export class SlidingWindow {
  /** Create a new SlidingWindow instance. */
  constructor() {
    /** @type {Map<string, number[]>} */
    this._windows = new Map();
  }

  /**
   * Check if a request is allowed under the sliding window algorithm.
   * @param {string} key - Rate limit key (e.g. "192.168.1.5:POST:/login")
   * @param {number} limit - Maximum requests allowed in the window
   * @param {number} windowSeconds - Window duration in seconds
   * @returns {{ allowed: boolean, current: number, limit: number, remaining: number, resetTime: number }}
   */
  check(key, limit, windowSeconds) {
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);

    let entry = this._windows.get(key) || [];

    // Filter out expired timestamps
    entry = entry.filter(ts => ts > windowStart);

    const current = entry.length;

    if (current < limit) {
      entry.push(now);
      this._windows.set(key, entry);
      return {
        allowed: true,
        current: current + 1,
        limit,
        remaining: limit - current - 1,
        resetTime: entry[0] + (windowSeconds * 1000)
      };
    }

    // Rate limited
    const resetTime = entry[0] + (windowSeconds * 1000);
    this._windows.set(key, entry);
    return {
      allowed: false,
      current,
      limit,
      remaining: 0,
      resetTime
    };
  }

  /**
   * Remove expired entries to prevent memory leaks.
   * Call this periodically.
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this._windows) {
      const filtered = entry.filter(ts => ts > now - 120_000);
      if (filtered.length === 0) {
        this._windows.delete(key);
      } else {
        this._windows.set(key, filtered);
      }
    }
  }
}
