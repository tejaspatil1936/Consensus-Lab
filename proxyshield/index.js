export { createProxyServer, startProxyServer } from './src/core/proxy-server.js';
export { loadConfig, watchConfig, getConfig } from './src/core/config-loader.js';
export { default as eventBus } from './src/core/event-bus.js';
export { createDashboardServer } from './src/dashboard/sse-server.js';
export { TokenBucket } from './src/algorithms/token-bucket.js';
export { SlidingWindow } from './src/algorithms/sliding-window.js';
export { calculateEntropy } from './src/algorithms/entropy.js';
export { isHealthCheck, handleHealthCheck, initHealthTracking } from './src/core/health.js';
export { createGeoBlocker } from './src/middlewares/geo-blocker.js';
export { lookupCountry } from './src/data/geo-ip.js';

import { loadConfig, watchConfig, getConfig } from './src/core/config-loader.js';
import eventBus from './src/core/event-bus.js';
import { createProxyServer, startProxyServer } from './src/core/proxy-server.js';
import { createDashboardServer } from './src/dashboard/sse-server.js';

/**
 * Convenience function to create a fully configured proxy instance.
 *
 * @param {Object} [options] - Configuration options
 * @param {string} [options.configPath] - Path to config.json (default: ./config.json)
 * @returns {Promise<{ start: Function, stop: Function, getConfig: Function, eventBus: EventEmitter }>}
 */
export async function createProxy(options = {}) {
  const configPath = options.configPath || './config.json';
  const config = loadConfig(configPath);

  const proxyServer = createProxyServer(config, eventBus);
  const dashboardServer = createDashboardServer(eventBus, config);

  return {
    /**
     * Start both proxy and dashboard servers.
     * @returns {Promise<void>}
     */
    start: async () => {
      await startProxyServer(proxyServer, config.server.listen_port);
      await new Promise((resolve, reject) => {
        dashboardServer.listen(config.server.dashboard_port, resolve);
        dashboardServer.once('error', reject);
      });
    },
    /**
     * Gracefully stop both servers.
     * @returns {Promise<void>}
     */
    stop: async () => {
      await new Promise(resolve => proxyServer.close(resolve));
      await new Promise(resolve => dashboardServer.close(resolve));
    },
    getConfig,
    eventBus
  };
}
