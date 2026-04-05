import http from 'http';

/**
 * @typedef {Object} HealthStatus
 * @property {'healthy'|'degraded'|'unhealthy'} status
 * @property {number} uptime         - Seconds since proxy started
 * @property {string} version
 * @property {{ rss: number, heapUsed: number, heapTotal: number, external: number }} memory - Bytes
 * @property {{ status: 'reachable'|'unreachable', latencyMs: number|null, lastCheck: string }} backend
 * @property {{ active: number, list: string[] }} middlewares
 * @property {{ requestsPerSecond: number, totalRequests: number, totalForwarded: number, totalBlocked: number }} traffic
 * @property {string} timestamp
 */

const VERSION = '1.0.2';
const HEALTH_PATH = '/__proxyshield/health';

/** Tracks backend reachability */
let backendStatus = { reachable: false, latencyMs: null, lastCheck: null, consecutiveFailures: 0 };

/** Traffic counters — updated via event bus */
let trafficStats = { totalRequests: 0, totalForwarded: 0, totalBlocked: 0 };
const rpsWindow = [];

/** Proxy start time */
let startedAt = null;

/**
 * Initialize health tracking by subscribing to the event bus.
 * Call once at startup.
 *
 * @param {import('events').EventEmitter} eventBus
 */
export function initHealthTracking(eventBus) {
  startedAt = Date.now();

  eventBus.on('request:received', () => {
    trafficStats.totalRequests++;
    rpsWindow.push(Date.now());
  });
  eventBus.on('request:forwarded', () => { trafficStats.totalForwarded++; });
  eventBus.on('request:blocked', () => { trafficStats.totalBlocked++; });
}

/**
 * Ping the backend server to check reachability.
 * Makes a HEAD request with a 5-second timeout.
 *
 * @param {string} backendUrl - e.g. "http://localhost:8080"
 * @returns {Promise<{ reachable: boolean, latencyMs: number|null }>}
 */
function pingBackend(backendUrl) {
  return new Promise((resolve) => {
    const start = Date.now();
    try {
      const url = new URL(backendUrl);
      const req = http.request({
        hostname: url.hostname,
        port: url.port || 80,
        path: '/',
        method: 'HEAD',
        timeout: 5000
      }, (res) => {
        // Any response means backend is reachable
        res.resume();
        resolve({ reachable: true, latencyMs: Date.now() - start });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ reachable: false, latencyMs: null });
      });

      req.on('error', () => {
        resolve({ reachable: false, latencyMs: null });
      });

      req.end();
    } catch {
      resolve({ reachable: false, latencyMs: null });
    }
  });
}

/**
 * Calculate current requests per second from the sliding window.
 * @returns {number}
 */
function calculateRps() {
  const now = Date.now();
  const cutoff = now - 10_000;
  while (rpsWindow.length > 0 && rpsWindow[0] < cutoff) {
    rpsWindow.shift();
  }
  return Math.round((rpsWindow.length / 10) * 10) / 10;
}

/**
 * Check if a request is for the health endpoint.
 *
 * @param {string} url - Request URL
 * @returns {boolean}
 */
export function isHealthCheck(url) {
  const path = url.split('?')[0];
  return path === HEALTH_PATH;
}

/**
 * Handle a health check request. Pings the backend, gathers metrics,
 * and responds with a JSON health report.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {Object} config - Current proxy config
 */
export async function handleHealthCheck(req, res, config) {
  // Ping backend
  const ping = await pingBackend(config.server.backend_url);
  backendStatus.reachable = ping.reachable;
  backendStatus.latencyMs = ping.latencyMs;
  backendStatus.lastCheck = new Date().toISOString();

  if (ping.reachable) {
    backendStatus.consecutiveFailures = 0;
  } else {
    backendStatus.consecutiveFailures++;
  }

  // Memory
  const mem = process.memoryUsage();

  // Determine overall status
  let status = 'healthy';
  if (!ping.reachable) {
    status = backendStatus.consecutiveFailures >= 3 ? 'unhealthy' : 'degraded';
  }

  const rps = calculateRps();

  /** @type {HealthStatus} */
  const health = {
    status,
    uptime: startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0,
    version: VERSION,
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external
    },
    backend: {
      url: config.server.backend_url,
      status: ping.reachable ? 'reachable' : 'unreachable',
      latencyMs: ping.latencyMs,
      consecutiveFailures: backendStatus.consecutiveFailures,
      lastCheck: backendStatus.lastCheck
    },
    middlewares: {
      active: config.middlewares.length,
      list: config.middlewares
    },
    traffic: {
      requestsPerSecond: rps,
      totalRequests: trafficStats.totalRequests,
      totalForwarded: trafficStats.totalForwarded,
      totalBlocked: trafficStats.totalBlocked
    },
    config: {
      listenPort: config.server.listen_port,
      dashboardPort: config.server.dashboard_port,
      rateLimitRules: config.rate_limits.length,
      honeypots: config.honeypots.length,
      wafEnabled: config.security.block_sql_injection || config.security.block_xss
    },
    timestamp: new Date().toISOString()
  };

  const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store',
    'X-ProxyShield-Status': status
  });
  res.end(JSON.stringify(health, null, 2));
}
