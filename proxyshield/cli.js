#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig, watchConfig, getConfig } from './src/core/config-loader.js';
import { createProxyServer, startProxyServer } from './src/core/proxy-server.js';
import { createDashboardServer } from './src/dashboard/sse-server.js';
import eventBus from './src/core/event-bus.js';
import { setVerbose } from './src/utils/logger.js';

const program = new Command();

program
  .name('proxyshield')
  .description('High-performance reverse proxy and API gateway')
  .version('1.0.0');

program
  .command('start')
  .description('Start the proxy server')
  .option('-c, --config <path>', 'path to config.json', './config.json')
  .option('-p, --port <number>', 'override listen port', parseInt)
  .option('-v, --verbose', 'enable verbose logging')
  .action(async (opts) => {
    try {
      if (opts.verbose) setVerbose(true);

      const config = loadConfig(opts.config);
      const port = opts.port || config.server.listen_port;

      const proxyServer = createProxyServer(config, eventBus);
      await startProxyServer(proxyServer, port);

      // Start dashboard if enabled
      let dashboardPort = config.server.dashboard_port;
      if (config.dashboard.enabled) {
        const dashboardServer = createDashboardServer(eventBus, config);
        await new Promise((resolve, reject) => {
          dashboardServer.listen(dashboardPort, resolve);
          dashboardServer.once('error', reject);
        });
      }

      // Start config file watcher
      watchConfig(opts.config, eventBus);

      const mwCount = config.middlewares.length;

      console.log('');
      console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
      console.log('\u2551         ProxyShield v1.0.0               \u2551');
      console.log('\u2551     Reverse Proxy & API Gateway          \u2551');
      console.log('\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563');
      console.log(`\u2551  Proxy:     http://localhost:${port}        \u2551`);
      console.log(`\u2551  Backend:   ${config.server.backend_url}        \u2551`);
      console.log(`\u2551  Dashboard: http://localhost:${dashboardPort}        \u2551`);
      console.log(`\u2551  Middlewares: ${mwCount} active                   \u2551`);
      console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');
      console.log('');
    } catch (err) {
      console.error('Failed to start ProxyShield:', err.message);
      process.exit(1);
    }
  });

program
  .command('benchmark')
  .description('Run built-in benchmark')
  .option('-n, --requests <number>', 'number of requests', parseInt, 10000)
  .option('-c, --concurrency <number>', 'concurrent connections', parseInt, 100)
  .option('--config <path>', 'config file path', './config.json')
  .action(async (opts) => {
    try {
      const { runBenchmark } = await import('./benchmark/self-test.js');
      await runBenchmark({
        requests: opts.requests,
        concurrency: opts.concurrency,
        configPath: opts.config
      });
    } catch (err) {
      console.error('Benchmark failed:', err.message);
      process.exit(1);
    }
  });

program.parse();
