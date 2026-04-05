/**
 * IP Blacklist middleware factory.
 * Checks if the client's IP is in the static blacklist (from config) or
 * in the runtime ban list (populated by the honeypot middleware).
 *
 * @param {Map<string, { bannedAt: number, banDurationMs: number }>} runtimeBanMap - Shared runtime ban map
 * @returns {Function} Middleware function with signature (req, res, context) => Promise<string>
 */
export function createIpBlacklist(runtimeBanMap) {
  return async function ipBlacklist(req, res, context) {
    const ip = context.ip;

    // Check static blacklist
    if (context.config.security.blacklisted_ips.includes(ip)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden', reason: 'BLACKLISTED_IP' }));
      context.eventBus.emit('request:blocked', {
        ip,
        method: req.method,
        path: req.url,
        reason: 'IP is permanently blacklisted',
        threatTag: 'BLACKLISTED_IP',
        timestamp: Date.now()
      });
      return 'stop';
    }

    // Check runtime ban map
    if (runtimeBanMap.has(ip)) {
      const entry = runtimeBanMap.get(ip);
      if (Date.now() > entry.bannedAt + entry.banDurationMs) {
        // Ban expired — remove and allow
        runtimeBanMap.delete(ip);
        return 'next';
      }
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden', reason: 'HONEYPOT_BANNED' }));
      context.eventBus.emit('request:blocked', {
        ip,
        method: req.method,
        path: req.url,
        reason: 'IP banned by honeypot',
        threatTag: 'HONEYPOT_TRAP',
        timestamp: Date.now()
      });
      return 'stop';
    }

    return 'next';
  };
}
