# ProxyShield

**High-Performance Reverse Proxy & API Gateway — Built from Scratch with Pure Node.js**

[![npm version](https://img.shields.io/npm/v/@tejas_1936/proxyshield)](https://www.npmjs.com/package/@tejas_1936/proxyshield)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-1-blue)](#)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](./LICENSE)

ProxyShield sits between your clients and backend like a security guard. It intercepts all traffic, enforces rate limits, filters cyber threats (SQL injection, XSS, encoded payloads), auto-bans hackers via honeypot traps, and routes safe requests to your backend — all with a real-time dashboard.

**One dependency. Zero frameworks. Pure Node.js.**

---

## Table of Contents

- [Installation](#installation)
- [Quick Start (5 minutes)](#quick-start-5-minutes)
- [Usage as CLI Tool](#usage-as-cli-tool)
- [Usage as npm Library](#usage-as-npm-library)
- [Configuration Reference](#configuration-reference)
- [Features In-Depth](#features-in-depth)
- [Real-Time Dashboard](#real-time-dashboard)
- [Custom Middleware](#custom-middleware-guide)
- [Attack Simulation](#attack-simulation)
- [Benchmarking](#benchmarking)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Installation

### Option 1: Install globally (recommended for CLI usage)

```bash
npm install -g @tejas_1936/proxyshield
```

Now you can run `proxyshield` from anywhere:

```bash
proxyshield start
proxyshield --help
```

### Option 2: Install as a project dependency

```bash
npm install @tejas_1936/proxyshield
```

Then use it programmatically in your code or via `npx`:

```bash
npx @tejas_1936/proxyshield start
```

### Option 3: Run without installing

```bash
npx @tejas_1936/proxyshield start --config ./config.json
```

### Requirements

- **Node.js 18.0.0 or higher**
- Works on Linux, macOS, and Windows

---

## Quick Start (5 minutes)

### Step 1: Create a config file

Create a file called `config.json` in your project root:

```json
{
  "server": {
    "listen_port": 9090,
    "backend_url": "http://localhost:8080",
    "dashboard_port": 9091
  },
  "middlewares": [
    "ip-blacklist",
    "waf",
    "honeypot",
    "rate-limiter",
    "throttle",
    "headers"
  ],
  "rate_limits": [
    {
      "path": "/api/login",
      "method": "POST",
      "limit": 5,
      "window_seconds": 60,
      "algorithm": "sliding_window",
      "throttle_enabled": true
    },
    {
      "path": "/api/users",
      "method": "GET",
      "limit": 100,
      "window_seconds": 60,
      "algorithm": "token_bucket",
      "throttle_enabled": false
    }
  ],
  "security": {
    "block_sql_injection": true,
    "block_xss": true,
    "entropy_threshold": 5.5,
    "max_body_bytes": 1048576,
    "blacklisted_ips": []
  },
  "honeypots": [
    { "path": "/admin", "ban_minutes": 30 },
    { "path": "/.env", "ban_minutes": 60 },
    { "path": "/wp-login.php", "ban_minutes": 30 },
    { "path": "/phpmyadmin", "ban_minutes": 60 }
  ],
  "throttle": {
    "warn_threshold": 0.8,
    "warn_delay_ms": 200,
    "critical_threshold": 0.9,
    "critical_delay_ms": 500
  },
  "dashboard": {
    "enabled": true,
    "max_events": 1000
  }
}
```

### Step 2: Point it at your backend

Change `"backend_url"` to wherever your real backend server runs:

```json
"backend_url": "http://localhost:3000"
```

### Step 3: Start the proxy

```bash
proxyshield start --config ./config.json
```

You'll see:

```
╔══════════════════════════════════════════╗
║         ProxyShield v1.0.0               ║
║     Reverse Proxy & API Gateway          ║
╠══════════════════════════════════════════╣
║  Proxy:     http://localhost:9090        ║
║  Backend:   http://localhost:3000        ║
║  Dashboard: http://localhost:9091        ║
║  Middlewares: 6 active                   ║
╚══════════════════════════════════════════╝
```

### Step 4: Send traffic through the proxy

Instead of hitting your backend directly, send requests to the proxy:

```bash
# Before (direct to backend):
curl http://localhost:3000/api/users

# After (through ProxyShield):
curl http://localhost:9090/api/users
```

Everything passes through the security pipeline automatically.

### Step 5: Open the dashboard

Open http://localhost:9091 in your browser to see live traffic, blocked attacks, and threat distribution in real time.

---

## Usage as CLI Tool

### `proxyshield start`

Start the proxy server.

```bash
proxyshield start [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config <path>` | Path to config.json | `./config.json` |
| `-p, --port <number>` | Override the listen port | from config |
| `-v, --verbose` | Enable debug-level logging | off |

**Examples:**

```bash
# Basic start
proxyshield start

# Custom config and port
proxyshield start --config /etc/proxyshield/config.json --port 8888

# Verbose mode for debugging
proxyshield start --verbose
```

### `proxyshield benchmark`

Run a built-in load test against the proxy.

```bash
proxyshield benchmark [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --requests <number>` | Total requests to send | 10000 |
| `-c, --concurrency <number>` | Concurrent connections | 100 |
| `--config <path>` | Config file path | `./config.json` |

**Example:**

```bash
proxyshield benchmark -n 5000 -c 50
```

---

## Usage as npm Library

You can use ProxyShield programmatically in your Node.js application:

### Basic usage

```javascript
import { createProxy } from '@tejas_1936/proxyshield';

const proxy = await createProxy({
  configPath: './config.json'
});

// Start the proxy and dashboard
await proxy.start();

console.log('ProxyShield is running!');

// Listen for events
proxy.eventBus.on('request:blocked', (data) => {
  console.log(`Blocked ${data.ip} — ${data.threatTag}`);
});

proxy.eventBus.on('request:forwarded', (data) => {
  console.log(`Forwarded ${data.method} ${data.path} — ${data.latencyMs}ms`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await proxy.stop();
  process.exit(0);
});
```

### Advanced: individual components

```javascript
import {
  loadConfig,
  watchConfig,
  getConfig,
  createProxyServer,
  startProxyServer,
  createDashboardServer,
  eventBus,
  TokenBucket,
  SlidingWindow,
  calculateEntropy
} from '@tejas_1936/proxyshield';

// Load config manually
const config = loadConfig('./config.json');

// Create and start the proxy
const server = createProxyServer(config, eventBus);
await startProxyServer(server, 9090);

// Start the dashboard separately
const dashboard = createDashboardServer(eventBus, config);
dashboard.listen(9091);

// Watch config for hot-reload
watchConfig('./config.json', eventBus);

// Use algorithms standalone
const bucket = new TokenBucket();
const result = bucket.check('user-123', 100, 60);
console.log(result.allowed); // true/false

// Calculate entropy of a string
const entropy = calculateEntropy('suspicious payload here');
console.log(entropy); // 0-8 bits per byte
```

### Event bus events

Subscribe to these events on the `eventBus`:

| Event | Data | Description |
|-------|------|-------------|
| `request:received` | `{ ip, method, path, timestamp }` | Every incoming request |
| `request:forwarded` | `{ ip, method, path, statusCode, latencyMs, timestamp }` | Successfully proxied |
| `request:blocked` | `{ ip, method, path, reason, threatTag, timestamp }` | Blocked by middleware |
| `ip:banned` | `{ ip, path, banMinutes, timestamp }` | IP auto-banned by honeypot |
| `config:reloaded` | `{ diffs, timestamp }` | Config file changed |
| `rate-limit:warning` | `{ ip, path, usagePercent, delayMs, timestamp }` | Request throttled |

---

## Configuration Reference

### `server`

| Field | Type | Description |
|-------|------|-------------|
| `listen_port` | number | Port the proxy listens on (1-65535) |
| `backend_url` | string | Your backend server URL (e.g. `http://localhost:3000`) |
| `dashboard_port` | number | Port for the dashboard UI (must differ from listen_port) |

### `middlewares`

Array of middleware names in execution order. Available:

| Name | What it does |
|------|-------------|
| `ip-blacklist` | Blocks IPs from static blacklist + runtime honeypot bans |
| `waf` | Scans for SQL injection, XSS, and high-entropy payloads |
| `honeypot` | Traps requests to fake paths and auto-bans the IP |
| `rate-limiter` | Per-IP, per-endpoint rate limiting |
| `throttle` | Adds delay to requests approaching the rate limit |
| `headers` | Injects `X-RateLimit-*` response headers |

Remove any middleware from the array to disable it. Order matters — put `ip-blacklist` first for best performance.

### `rate_limits`

Array of per-endpoint rules:

| Field | Type | Description |
|-------|------|-------------|
| `path` | string | URL path to match (e.g. `/api/login`) |
| `method` | string | HTTP method (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) |
| `limit` | number | Max requests per window per IP |
| `window_seconds` | number | Time window in seconds |
| `algorithm` | string | `"token_bucket"` (allows bursts) or `"sliding_window"` (strict) |
| `throttle_enabled` | boolean | Enable graduated throttling for this endpoint |

### `security`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `block_sql_injection` | boolean | `true` | Enable SQL injection detection |
| `block_xss` | boolean | `true` | Enable XSS detection |
| `entropy_threshold` | number | `5.5` | Block request bodies with entropy above this (0-8) |
| `max_body_bytes` | number | `1048576` | Max request body size (1MB default) |
| `blacklisted_ips` | string[] | `[]` | IPs to permanently block |

### `honeypots`

Array of trap URLs. Any IP hitting these gets auto-banned:

```json
{ "path": "/admin", "ban_minutes": 30 }
```

### `throttle`

| Field | Default | Description |
|-------|---------|-------------|
| `warn_threshold` | `0.8` | Start slowing at 80% of rate limit |
| `warn_delay_ms` | `200` | Delay in ms at warn level |
| `critical_threshold` | `0.9` | Increase delay at 90% |
| `critical_delay_ms` | `500` | Delay in ms at critical level |

### `dashboard`

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Enable/disable the dashboard |
| `max_events` | `1000` | Max events to buffer in memory |

### Hot Reload

Edit `config.json` while the proxy is running. Changes apply automatically — no restart needed. The dashboard shows a live diff of what changed.

---

## Features In-Depth

### WAF (Web Application Firewall)

Scans URL paths, query parameters, and request bodies for:

- **SQL Injection** — `' OR 1=1`, `UNION SELECT`, `DROP TABLE`, stacked queries, comment bypasses
- **XSS** — `<script>`, event handlers (`onerror`, `onload`), `javascript:` URIs, `eval()`, DOM manipulation
- **High-Entropy Payloads** — Catches base64-encoded or obfuscated attacks that bypass regex. Normal text is ~3.5-4.5 bits/byte; encoded attacks are ~5.5-6.0. Skips binary content types to avoid false positives.

### Rate Limiting Algorithms

**Token Bucket** — Best for APIs that should allow short bursts. Tokens refill at a steady rate. Good for `GET` endpoints.

**Sliding Window** — Strict enforcement with no bursts. Counts requests in a rolling time window. Good for sensitive endpoints like `/login`.

### Honeypot Traps

No real user visits `/admin`, `/.env`, or `/wp-login.php`. Only automated scanners and hackers hit these. When they do:

1. IP is auto-banned for the configured duration
2. All future requests from that IP are blocked
3. Event is logged with `HONEYPOT_TRAP` tag
4. Dashboard lights up

### Graduated Throttling

Instead of hard-blocking at the limit, ProxyShield slows clients down first:

- **< 80% usage** — no delay, normal speed
- **80-90% usage** — 200ms delay per request (warning)
- **90%+ usage** — 500ms delay per request (critical)
- **100% usage** — 429 Too Many Requests (blocked)

---

## Real-Time Dashboard

Open `http://localhost:9091` to see:

- **Live RPS gauge** — requests per second
- **Stat cards** — total forwarded, blocked, active bans
- **Traffic chart** — 60-second rolling bar chart (green = forwarded, red = blocked)
- **Threat distribution** — horizontal bars showing attack types
- **Event feed** — scrolling table of every request with status pills and threat tags
- **Config reload notifications** — live diffs when config changes

The dashboard uses Server-Sent Events (SSE) — no WebSocket library needed.

---

## Custom Middleware Guide

### Step 1: Write the middleware

Create a file (e.g. `my-middleware.js`):

```javascript
export function createGeoBlocker(blockedCountries) {
  return async function geoBlocker(req, res, context) {
    // context.ip — the client's IP
    // context.config — current config
    // context.bodyText — request body (string or null)
    // context.eventBus — emit events

    const country = lookupCountry(context.ip); // your logic

    if (blockedCountries.includes(country)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden', reason: 'GEO_BLOCKED' }));

      context.eventBus.emit('request:blocked', {
        ip: context.ip,
        method: req.method,
        path: req.url,
        reason: 'Geo-blocked country: ' + country,
        threatTag: 'GEO_BLOCKED',
        timestamp: Date.now()
      });

      return 'stop'; // halt the pipeline
    }

    return 'next'; // continue to next middleware
  };
}
```

### Step 2: Register it

In `src/core/proxy-server.js`, add it to the middleware factory map:

```javascript
const middlewareFactories = {
  'ip-blacklist': () => createIpBlacklist(runtimeBanMap),
  'waf': () => createWafFilter(),
  'geo-blocker': () => createGeoBlocker(['CN', 'RU']), // your middleware
  // ...
};
```

### Step 3: Enable in config

```json
"middlewares": ["ip-blacklist", "waf", "geo-blocker", "rate-limiter", "throttle", "headers"]
```

---

## Attack Simulation

Run the built-in attack simulation to see ProxyShield in action:

```bash
# Make sure proxy is running first, then in another terminal:
bash scripts/attack-sim.sh
```

This fires SQL injection, XSS, brute force, honeypot probes, and DDoS simulation against the proxy. Watch the dashboard at http://localhost:9091 while it runs.

---

## Benchmarking

```bash
proxyshield benchmark -n 10000 -c 100
```

Output:

```
╔══════════════════════════════════════╗
║   ProxyShield Benchmark Results     ║
╠══════════════════════════════════════╣
║  Total requests:    10,000          ║
║  Successful:        10,000          ║
║  Failed:            0               ║
║  Duration:          1.23s           ║
║  Throughput:        8,130 req/s     ║
║                                     ║
║  Latency Distribution:              ║
║    min:   0.3ms                     ║
║    avg:   1.2ms                     ║
║    p50:   0.8ms                     ║
║    p95:   2.1ms                     ║
║    p99:   4.3ms                     ║
║    max:   12.7ms                    ║
╚══════════════════════════════════════╝
```

---

## Architecture

```
Client (port 9090)
    │
    ▼
┌─────────────────────────────────────────────┐
│           ProxyShield Gateway               │
│                                             │
│  ┌─────────────────┐     ┌──────────────┐  │
│  │  Middleware      │     │  Event Bus   │  │
│  │  Pipeline        │────▶│ (EventEmitter)│ │
│  │                  │     │              │  │
│  │  1. IP Blacklist │     │  Subscribers: │  │
│  │  2. WAF Filter   │     │  - Dashboard  │  │
│  │  3. Honeypot     │     │  - Logger     │  │
│  │  4. Rate Limiter │     └──────────────┘  │
│  │  5. Throttle     │                       │
│  │  6. Headers      │                       │
│  │  7. Forwarder    │                       │
│  └─────────────────┘                        │
│                                             │
└─────────────────────────────────────────────┘
    │
    ▼
Backend Server (port 8080)
```

**Key design principles:**

- **Middleware Pipeline** — each feature is an independent `async function(req, res, context)`. Returns `'next'` to continue or `'stop'` to halt.
- **Event Bus Decoupling** — no middleware references another. They emit events to a central `EventEmitter`. Dashboard and logger subscribe independently.
- **Config-Driven** — all behavior controlled by `config.json`. No code changes needed.
- **Zero Feature Dependencies** — delete any middleware file and nothing else breaks.

---

## API Reference

### `createProxy(options)`

Creates a fully configured proxy instance.

```javascript
const proxy = await createProxy({ configPath: './config.json' });
await proxy.start();   // start proxy + dashboard
await proxy.stop();    // graceful shutdown
proxy.getConfig();     // current config
proxy.eventBus;        // event emitter
```

### `loadConfig(path)` / `getConfig()` / `watchConfig(path, eventBus)`

Config management functions.

### `createProxyServer(config, eventBus)` / `startProxyServer(server, port)`

Low-level server creation.

### `createDashboardServer(eventBus, config)`

Create the dashboard HTTP server.

### `TokenBucket` / `SlidingWindow`

Rate limiting algorithm classes with `.check(key, limit, windowSeconds)`.

### `calculateEntropy(text)`

Returns Shannon entropy (0-8 bits/byte) of a string.

---

## Troubleshooting

### "EADDRINUSE" — port already in use

```bash
# Find and kill the process
kill $(lsof -t -i:9090) 2>/dev/null
kill $(lsof -t -i:9091) 2>/dev/null
```

Or change the port: `proxyshield start --port 8888`

### "Cannot find module" after global install

Make sure you're on Node.js 18+:

```bash
node --version
```

### Config changes not applying

ProxyShield debounces config changes by 500ms. Wait a moment after saving. If the JSON is malformed, the old config is kept and a warning is logged.

### Backend returns 502

The backend server at `backend_url` is unreachable. Make sure it's running.

### Everything is 403 after hitting a honeypot

Your IP got auto-banned. Wait for the ban to expire, or restart the proxy to clear the runtime ban map.

---

## License

MIT — see [LICENSE](./LICENSE)

---

**Built with zero frameworks. One dependency. Pure Node.js.**

```bash
npm install -g @tejas_1936/proxyshield
proxyshield start
```
