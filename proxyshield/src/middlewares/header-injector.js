/**
 * Header injector middleware factory.
 * Adds rate limit response headers to every proxied response.
 * Uses res.setHeader() to queue headers before the forwarder calls writeHead.
 *
 * @returns {Function} Middleware function with signature (req, res, context) => Promise<string>
 */
export function createHeaderInjector() {
  return async function headerInjector(req, res, context) {
    if (!context.rateLimitInfo) return 'next';

    res.setHeader('X-RateLimit-Limit', String(context.rateLimitInfo.limit));
    res.setHeader('X-RateLimit-Remaining', String(context.rateLimitInfo.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(context.rateLimitInfo.resetTime / 1000)));

    return 'next';
  };
}
