import http from 'http';
import { loadConfig } from '../src/core/config-loader.js';
import { createProxyServer, startProxyServer } from '../src/core/proxy-server.js';
import eventBus from '../src/core/event-bus.js';

/**
 * Run the built-in benchmark.
 *
 * @param {Object} options - Benchmark options
 * @param {number} [options.requests=10000] - Total number of requests
 * @param {number} [options.concurrency=100] - Concurrent connections
 * @param {string} [options.configPath='./config.json'] - Config file path
 */
export async function runBenchmark(options = {}) {
  const totalRequests = options.requests || 10000;
  const concurrency = options.concurrency || 100;
  const configPath = options.configPath || './config.json';

  console.log(`\nPreparing benchmark: ${totalRequests} requests, ${concurrency} concurrent...\n`);

  // Load config
  const config = loadConfig(configPath);

  // Start a tiny in-process backend
  const backendPort = 18080;
  const backendServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise(resolve => backendServer.listen(backendPort, resolve));

  // Override backend_url to point to our in-process backend
  config.server.backend_url = `http://localhost:${backendPort}`;

  // Start proxy
  const proxyPort = 19090;
  const proxyServer = createProxyServer(config, eventBus);
  await startProxyServer(proxyServer, proxyPort);

  // Benchmark
  const latencies = [];
  let successCount = 0;
  let failCount = 0;
  let completed = 0;
  let requestIndex = 0;

  const startTime = Date.now();

  await new Promise((resolve) => {
    function sendRequest() {
      if (requestIndex >= totalRequests) return;
      requestIndex++;

      const reqStart = Date.now();

      const req = http.request({
        hostname: 'localhost',
        port: proxyPort,
        path: '/benchmark-test',
        method: 'GET'
      }, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          const latency = Date.now() - reqStart;
          latencies.push(latency);

          if (res.statusCode === 200) {
            successCount++;
          } else {
            failCount++;
          }

          completed++;
          if (completed === totalRequests) {
            resolve();
          } else {
            sendRequest();
          }
        });
      });

      req.on('error', () => {
        failCount++;
        completed++;
        if (completed === totalRequests) {
          resolve();
        } else {
          sendRequest();
        }
      });

      req.end();
    }

    // Launch initial concurrent workers
    const workers = Math.min(concurrency, totalRequests);
    for (let i = 0; i < workers; i++) {
      sendRequest();
    }
  });

  const totalTime = Date.now() - startTime;

  // Sort latencies for percentile calculation
  latencies.sort((a, b) => a - b);

  const p50 = latencies[Math.floor(0.5 * latencies.length)] || 0;
  const p95 = latencies[Math.floor(0.95 * latencies.length)] || 0;
  const p99 = latencies[Math.floor(0.99 * latencies.length)] || 0;
  const min = latencies[0] || 0;
  const max = latencies[latencies.length - 1] || 0;
  const avg = latencies.length > 0
    ? Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 10) / 10
    : 0;
  const throughput = Math.round((successCount / (totalTime / 1000)) * 10) / 10;

  console.log('');
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551   ProxyShield Benchmark Results     \u2551');
  console.log('\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563');
  console.log(`\u2551  Total requests:    ${totalRequests.toLocaleString().padEnd(15)}\u2551`);
  console.log(`\u2551  Successful:        ${successCount.toLocaleString().padEnd(15)}\u2551`);
  console.log(`\u2551  Failed:            ${failCount.toLocaleString().padEnd(15)}\u2551`);
  console.log(`\u2551  Duration:          ${(totalTime / 1000).toFixed(2).padEnd(15)}s\u2551`);
  console.log(`\u2551  Throughput:        ${throughput.toLocaleString().padEnd(15)}req/s\u2551`);
  console.log('\u2551                                      \u2551');
  console.log('\u2551  Latency Distribution:               \u2551');
  console.log(`\u2551    min:   ${(min + 'ms').padEnd(27)}\u2551`);
  console.log(`\u2551    avg:   ${(avg + 'ms').padEnd(27)}\u2551`);
  console.log(`\u2551    p50:   ${(p50 + 'ms').padEnd(27)}\u2551`);
  console.log(`\u2551    p95:   ${(p95 + 'ms').padEnd(27)}\u2551`);
  console.log(`\u2551    p99:   ${(p99 + 'ms').padEnd(27)}\u2551`);
  console.log(`\u2551    max:   ${(max + 'ms').padEnd(27)}\u2551`);
  console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');
  console.log('');

  // Cleanup
  await new Promise(resolve => proxyServer.close(resolve));
  await new Promise(resolve => backendServer.close(resolve));
}
