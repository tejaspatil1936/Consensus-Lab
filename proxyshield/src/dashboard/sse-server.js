import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

/**
 * Create the dashboard HTTP server. Serves static files and provides an SSE
 * endpoint that streams proxy events in real-time.
 *
 * @param {import('events').EventEmitter} eventBus - Central event bus
 * @param {Object} config - Configuration object
 * @returns {http.Server} Dashboard HTTP server
 */
export function createDashboardServer(eventBus, config) {
  const startTime = Date.now();

  // In-memory stats
  const stats = {
    totalRequests: 0,
    totalForwarded: 0,
    totalBlocked: 0,
    blockedByType: {},
    recentBlocked: [],
    requestsPerSecond: 0,
    bannedIps: [],
    uptime: 0
  };

  const maxEvents = config.dashboard?.max_events || 1000;

  // RPS calculation — circular buffer of timestamps
  const rpsTimestamps = [];

  // Update stats from events
  eventBus.on('request:received', () => {
    stats.totalRequests++;
    rpsTimestamps.push(Date.now());
  });

  eventBus.on('request:forwarded', () => {
    stats.totalForwarded++;
  });

  eventBus.on('request:blocked', (data) => {
    stats.totalBlocked++;
    if (data.threatTag) {
      stats.blockedByType[data.threatTag] = (stats.blockedByType[data.threatTag] || 0) + 1;
    }
    stats.recentBlocked.push(data);
    if (stats.recentBlocked.length > maxEvents) {
      stats.recentBlocked.shift();
    }
  });

  eventBus.on('ip:banned', (data) => {
    stats.bannedIps.push({
      ip: data.ip,
      path: data.path,
      banMinutes: data.banMinutes,
      bannedAt: data.timestamp,
      expiresAt: data.timestamp + (data.banMinutes * 60 * 1000)
    });
  });

  // Calculate RPS every second
  const rpsInterval = setInterval(() => {
    const now = Date.now();
    const tenSecsAgo = now - 10_000;
    // Remove old timestamps
    while (rpsTimestamps.length > 0 && rpsTimestamps[0] < tenSecsAgo) {
      rpsTimestamps.shift();
    }
    stats.requestsPerSecond = Math.round((rpsTimestamps.length / 10) * 10) / 10;
    stats.uptime = Math.floor((now - startTime) / 1000);

    // Clean expired bans
    stats.bannedIps = stats.bannedIps.filter(b => b.expiresAt > now);
  }, 1000);
  rpsInterval.unref();

  /**
   * Serve a static file from the public directory.
   * @param {http.ServerResponse} res
   * @param {string} filename
   * @param {string} contentType
   */
  function serveFile(res, filename, contentType) {
    const filePath = path.join(publicDir, filename);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }

  const server = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];

    // Route handling
    if (req.method === 'GET' && (urlPath === '/' || urlPath === '/dashboard')) {
      serveFile(res, 'index.html', 'text/html');
    } else if (req.method === 'GET' && urlPath === '/style.css') {
      serveFile(res, 'style.css', 'text/css');
    } else if (req.method === 'GET' && urlPath === '/app.js') {
      serveFile(res, 'app.js', 'application/javascript');
    } else if (req.method === 'GET' && urlPath === '/events') {
      // SSE endpoint
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      res.write(': connected\n\n');

      const sendEvent = (eventName, data) => {
        res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const listeners = {
        'request:received': (data) => sendEvent('request:received', data),
        'request:forwarded': (data) => sendEvent('request:forwarded', data),
        'request:blocked': (data) => sendEvent('request:blocked', data),
        'ip:banned': (data) => sendEvent('ip:banned', data),
        'config:reloaded': (data) => sendEvent('config:reloaded', data),
        'rate-limit:warning': (data) => sendEvent('rate-limit:warning', data)
      };

      for (const [event, listener] of Object.entries(listeners)) {
        eventBus.on(event, listener);
      }

      // Heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 30_000);

      // Cleanup on disconnect
      res.on('close', () => {
        for (const [event, listener] of Object.entries(listeners)) {
          eventBus.off(event, listener);
        }
        clearInterval(heartbeat);
      });
    } else if (req.method === 'GET' && urlPath === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(stats));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.on('error', (err) => {
    logger.error('Dashboard server error', { error: err.message });
  });

  return server;
}
