import http from 'http';
import logger from '../utils/logger.js';
import { getConfig } from './config-loader.js';
import { forwardRequest } from './forwarder.js';
import { isHealthCheck, handleHealthCheck, initHealthTracking } from './health.js';
import { createIpBlacklist } from '../middlewares/ip-blacklist.js';
import { createWafFilter } from '../middlewares/waf-filter.js';
import { createHoneypot } from '../middlewares/honeypot.js';
import { createRateLimiter } from '../middlewares/rate-limiter.js';
import { createThrottle } from '../middlewares/throttle.js';
import { createHeaderInjector } from '../middlewares/header-injector.js';
import { createGeoBlocker } from '../middlewares/geo-blocker.js';
import { TokenBucket } from '../algorithms/token-bucket.js';
import { SlidingWindow } from '../algorithms/sliding-window.js';

/** Shared state created once at startup */
const runtimeBanMap = new Map();
const tokenBucket = new TokenBucket();
const slidingWindow = new SlidingWindow();

/** Periodic cleanup interval reference */
let cleanupInterval = null;

/**
 * Build the middleware chain from config.
 * @param {Object} config - Current configuration
 * @returns {Function[]} Array of middleware functions
 */
function buildMiddlewareChain(config) {
  const middlewareFactories = {
    'ip-blacklist': () => createIpBlacklist(runtimeBanMap),
    'waf': () => createWafFilter(),
    'honeypot': () => createHoneypot(runtimeBanMap),
    'rate-limiter': () => createRateLimiter(tokenBucket, slidingWindow),
    'throttle': () => createThrottle(),
    'headers': () => createHeaderInjector(),
    'geo-blocker': () => createGeoBlocker()
  };

  return config.middlewares
    .filter(name => middlewareFactories[name])
    .map(name => middlewareFactories[name]());
}

/**
 * Clean the client IP address — remove ::ffff: prefix from IPv4-mapped IPv6.
 * @param {string} ip - Raw IP address
 * @returns {string} Cleaned IP address
 */
function cleanIp(ip) {
  if (!ip) return '0.0.0.0';
  return ip.replace(/^::ffff:/, '');
}

/**
 * Create the proxy HTTP server.
 * @param {Object} config - Configuration object
 * @param {import('events').EventEmitter} eventBus - Central event bus
 * @returns {http.Server} The HTTP server (not yet listening)
 */
export function createProxyServer(config, eventBus) {
  let middlewareChain = buildMiddlewareChain(config);

  // Rebuild middleware chain on config reload
  eventBus.on('config:reloaded', () => {
    middlewareChain = buildMiddlewareChain(getConfig());
    logger.info('Middleware chain rebuilt after config reload');
  });

  // Periodic cleanup every 60 seconds
  if (cleanupInterval) clearInterval(cleanupInterval);
  cleanupInterval = setInterval(() => {
    tokenBucket.cleanup();
    slidingWindow.cleanup();
  }, 60_000);
  cleanupInterval.unref();

  // Initialize health check tracking
  initHealthTracking(eventBus);

  const server = http.createServer(async (req, res) => {
    const config = getConfig();

    // Health check endpoint — bypasses all middlewares
    if (isHealthCheck(req.url)) {
      await handleHealthCheck(req, res, config);
      return;
    }

    const clientIp = cleanIp(req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress);

    // Emit request:received
    eventBus.emit('request:received', {
      ip: clientIp,
      method: req.method,
      path: req.url,
      timestamp: Date.now()
    });

    // Body parsing for POST, PUT, PATCH
    const method = req.method.toUpperCase();
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(method) &&
      (req.headers['content-length'] || req.headers['transfer-encoding']);

    let bodyBuffer = null;

    if (hasBody) {
      try {
        bodyBuffer = await new Promise((resolve, reject) => {
          const chunks = [];
          let totalSize = 0;

          req.on('data', (chunk) => {
            totalSize += chunk.length;
            if (totalSize > config.security.max_body_bytes) {
              req.destroy();
              reject(new Error('OVERSIZED'));
            }
            chunks.push(chunk);
          });

          req.on('end', () => resolve(Buffer.concat(chunks)));
          req.on('error', reject);
        });
      } catch (err) {
        if (err.message === 'OVERSIZED') {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          eventBus.emit('request:blocked', {
            ip: clientIp,
            method: req.method,
            path: req.url,
            reason: 'Payload exceeds max body size',
            threatTag: 'OVERSIZED_PAYLOAD',
            timestamp: Date.now()
          });
          return;
        }
        // Other body read errors — continue without body
        logger.error('Body read error', { error: err.message });
      }
    }

    // Attach body to request for middlewares
    req.body = bodyBuffer;
    req.bodyText = bodyBuffer ? bodyBuffer.toString('utf-8') : null;

    // Build context for this request
    const context = {
      config,
      eventBus,
      ip: clientIp,
      startTime: Date.now(),
      rateLimitInfo: null,
      body: req.body,
      bodyText: req.bodyText
    };

    // Run middleware pipeline
    let stopped = false;
    for (const middleware of middlewareChain) {
      try {
        const result = await middleware(req, res, context);
        if (result === 'stop') {
          stopped = true;
          break;
        }
      } catch (err) {
        logger.error('Middleware error', { middleware: middleware.name, error: err.message });
      }
    }

    // Forward to backend if not stopped
    if (!stopped) {
      forwardRequest(req, res, config.server.backend_url, eventBus, bodyBuffer, clientIp);
    }
  });

  // Handle server errors
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${err.port || 'unknown'} is already in use`);
      process.exit(1);
    }
    logger.error('Server error', { error: err.message });
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('ProxyShield shutting down gracefully');
    if (cleanupInterval) clearInterval(cleanupInterval);
    server.close(() => {
      process.exit(0);
    });
    // Force exit after 5 seconds
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

/**
 * Start the proxy server listening on the given port.
 * @param {http.Server} server - The HTTP server to start
 * @param {number} port - Port number to listen on
 * @returns {Promise<void>} Resolves when server is listening
 */
export function startProxyServer(server, port) {
  return new Promise((resolve, reject) => {
    server.listen(port, () => resolve());
    server.once('error', reject);
  });
}
