import { lookupCountry } from '../data/geo-ip.js';

/**
 * Geo-IP blocking middleware factory.
 *
 * Reads `config.security.blocked_countries` and/or
 * `config.security.allowed_countries` on every request (supports hot-reload).
 *
 * Modes:
 *  - blocked_countries only → block listed countries, allow everything else
 *  - allowed_countries only → allow listed countries, block everything else
 *  - both empty            → pass all traffic (middleware is a no-op)
 *  - both set              → blocked_countries takes precedence; allowed_countries is ignored
 *
 * Private / unknown IPs are never blocked.
 *
 * @returns {Function} Middleware (req, res, context) => Promise<'next'|'stop'>
 */
export function createGeoBlocker() {
  return async function geoBlocker(req, res, context) {
    const sec = context.config.security;
    const blockedList = sec.blocked_countries || [];
    const allowedList = sec.allowed_countries || [];

    // No rules configured — pass all traffic
    if (blockedList.length === 0 && allowedList.length === 0) return 'next';

    const ip = context.ip;
    const country = lookupCountry(ip);

    // Private and unknown IPs always pass through
    if (country === 'private' || country === 'unknown') return 'next';

    let shouldBlock = false;

    if (blockedList.length > 0) {
      // Deny-list mode: block if country is in the blocked list
      shouldBlock = blockedList.includes(country);
    } else {
      // Allow-list mode: block if country is NOT in the allowed list
      shouldBlock = !allowedList.includes(country);
    }

    if (shouldBlock) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden', reason: 'GEO_BLOCKED', country }));
      context.eventBus.emit('request:blocked', {
        ip,
        method: req.method,
        path: req.url,
        reason: `Geo-blocked country: ${country}`,
        threatTag: 'GEO_BLOCKED',
        timestamp: Date.now()
      });
      return 'stop';
    }

    return 'next';
  };
}
