/**
 * Honeypot middleware factory.
 * Defines fake trap URLs that no legitimate user would visit.
 * When a request hits a honeypot path, auto-ban the IP for a configured duration.
 *
 * @param {Map<string, { bannedAt: number, banDurationMs: number }>} runtimeBanMap - Shared runtime ban map
 * @returns {Function} Middleware function with signature (req, res, context) => Promise<string>
 */
export function createHoneypot(runtimeBanMap) {
  return async function honeypot(req, res, context) {
    // Extract just the pathname (without query string)
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      pathname = req.url;
    }

    // Check if the pathname matches any honeypot path
    const honeypots = context.config.honeypots || [];
    const match = honeypots.find(hp => hp.path === pathname);

    if (!match) return 'next';

    // Calculate ban duration
    const banDurationMs = match.ban_minutes * 60 * 1000;

    // Ban the IP
    runtimeBanMap.set(context.ip, {
      bannedAt: Date.now(),
      banDurationMs
    });

    // Emit events
    context.eventBus.emit('ip:banned', {
      ip: context.ip,
      path: pathname,
      banMinutes: match.ban_minutes,
      timestamp: Date.now()
    });

    context.eventBus.emit('request:blocked', {
      ip: context.ip,
      method: req.method,
      path: req.url,
      reason: 'Honeypot trap triggered',
      threatTag: 'HONEYPOT_TRAP',
      timestamp: Date.now()
    });

    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden', reason: 'HONEYPOT_TRAP' }));

    return 'stop';
  };
}
