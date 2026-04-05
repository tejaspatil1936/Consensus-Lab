/**
 * Rate limiter middleware factory.
 * Per-IP per-endpoint rate limiting using either Token Bucket or Sliding Window
 * algorithm, configurable per endpoint in config.json.
 *
 * @param {import('../algorithms/token-bucket.js').TokenBucket} tokenBucket - Token bucket instance
 * @param {import('../algorithms/sliding-window.js').SlidingWindow} slidingWindow - Sliding window instance
 * @returns {Function} Middleware function with signature (req, res, context) => Promise<string>
 */
export function createRateLimiter(tokenBucket, slidingWindow) {
  return async function rateLimiter(req, res, context) {
    // Extract pathname
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      pathname = req.url;
    }

    // Find matching rate limit rule
    const rule = context.config.rate_limits.find(
      r => r.path === pathname && r.method.toUpperCase() === req.method.toUpperCase()
    );

    // No matching rule — allow freely
    if (!rule) return 'next';

    // Build rate limit key
    const key = `${context.ip}:${req.method}:${rule.path}`;

    // Choose algorithm
    let result;
    if (rule.algorithm === 'token_bucket') {
      result = tokenBucket.check(key, rule.limit, rule.window_seconds);
    } else {
      result = slidingWindow.check(key, rule.limit, rule.window_seconds);
    }

    // Store info for downstream middlewares (throttle, header-injector)
    context.rateLimitInfo = {
      limit: result.limit,
      current: result.current,
      remaining: result.remaining,
      resetTime: result.resetTime,
      throttleEnabled: rule.throttle_enabled || false,
      path: rule.path
    };

    if (!result.allowed) {
      // Determine threat tag
      const threatTag = (rule.path === '/login' || rule.limit <= 10) ? 'BRUTE_FORCE' : 'RATE_LIMITED';
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);

      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000))
      });
      res.end(JSON.stringify({ error: 'Rate limit exceeded', retryAfter }));

      context.eventBus.emit('request:blocked', {
        ip: context.ip,
        method: req.method,
        path: req.url,
        reason: `Rate limit exceeded for ${rule.path}`,
        threatTag,
        timestamp: Date.now()
      });

      return 'stop';
    }

    return 'next';
  };
}
