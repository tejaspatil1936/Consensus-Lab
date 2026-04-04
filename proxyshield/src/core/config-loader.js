import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';
import { diffConfigs } from '../utils/config-differ.js';

/** @type {Object|null} Current active configuration */
let currentConfig = null;

/** Known valid middleware names */
const VALID_MIDDLEWARES = ['ip-blacklist', 'geo-blocker', 'waf', 'honeypot', 'rate-limiter', 'throttle', 'headers'];

/** Valid HTTP methods for rate limit rules */
const VALID_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

/**
 * Apply defaults to a parsed config object and validate all fields.
 * @param {Object} config - Raw parsed config
 * @returns {Object} Config with defaults applied
 * @throws {Error} If required fields are missing or invalid
 */
function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }

  // server validation
  if (!config.server || typeof config.server !== 'object') {
    throw new Error('config.server is required');
  }
  if (!Number.isInteger(config.server.listen_port) || config.server.listen_port < 1 || config.server.listen_port > 65535) {
    throw new Error('server.listen_port must be an integer between 1 and 65535');
  }
  if (typeof config.server.backend_url !== 'string' || !config.server.backend_url.length ||
      (!config.server.backend_url.startsWith('http://') && !config.server.backend_url.startsWith('https://'))) {
    throw new Error('server.backend_url must be a non-empty string starting with http:// or https://');
  }
  if (!Number.isInteger(config.server.dashboard_port) || config.server.dashboard_port < 1 || config.server.dashboard_port > 65535) {
    throw new Error('server.dashboard_port must be an integer between 1 and 65535');
  }
  if (config.server.dashboard_port === config.server.listen_port) {
    throw new Error('server.dashboard_port must be different from server.listen_port');
  }

  // middlewares validation
  if (!Array.isArray(config.middlewares)) {
    throw new Error('middlewares must be an array');
  }
  for (const name of config.middlewares) {
    if (typeof name !== 'string') {
      throw new Error('Each middleware must be a string');
    }
    if (!VALID_MIDDLEWARES.includes(name)) {
      logger.warn('Unknown middleware name', { middleware: name });
    }
  }

  // rate_limits validation and defaults
  if (!Array.isArray(config.rate_limits)) {
    throw new Error('rate_limits must be an array');
  }
  for (const rule of config.rate_limits) {
    if (typeof rule.path !== 'string' || !rule.path.startsWith('/')) {
      throw new Error('rate_limits[].path must be a string starting with /');
    }
    if (typeof rule.method !== 'string' || !VALID_METHODS.includes(rule.method.toUpperCase())) {
      throw new Error(`rate_limits[].method must be one of ${VALID_METHODS.join(', ')}`);
    }
    rule.method = rule.method.toUpperCase();
    if (!Number.isInteger(rule.limit) || rule.limit < 1) {
      throw new Error('rate_limits[].limit must be a positive integer');
    }
    if (!Number.isInteger(rule.window_seconds) || rule.window_seconds < 1) {
      throw new Error('rate_limits[].window_seconds must be a positive integer');
    }
    if (rule.algorithm === undefined) rule.algorithm = 'sliding_window';
    if (rule.throttle_enabled === undefined) rule.throttle_enabled = false;
  }

  // security defaults and validation
  if (!config.security) config.security = {};
  if (config.security.block_sql_injection === undefined) config.security.block_sql_injection = true;
  if (config.security.block_xss === undefined) config.security.block_xss = true;
  if (config.security.entropy_threshold === undefined) config.security.entropy_threshold = 5.5;
  if (typeof config.security.entropy_threshold !== 'number' || config.security.entropy_threshold < 0 || config.security.entropy_threshold > 8) {
    throw new Error('security.entropy_threshold must be a number between 0 and 8');
  }
  if (config.security.max_body_bytes === undefined) config.security.max_body_bytes = 1048576;
  if (!Number.isInteger(config.security.max_body_bytes) || config.security.max_body_bytes < 1) {
    throw new Error('security.max_body_bytes must be a positive integer');
  }
  if (!Array.isArray(config.security.blacklisted_ips)) config.security.blacklisted_ips = [];

  // Geo-IP blocking defaults and validation
  if (!Array.isArray(config.security.blocked_countries)) config.security.blocked_countries = [];
  if (!Array.isArray(config.security.allowed_countries)) config.security.allowed_countries = [];
  for (const cc of config.security.blocked_countries) {
    if (typeof cc !== 'string' || !/^[A-Z]{2}$/.test(cc)) {
      throw new Error('security.blocked_countries must contain 2-letter uppercase ISO country codes');
    }
  }
  for (const cc of config.security.allowed_countries) {
    if (typeof cc !== 'string' || !/^[A-Z]{2}$/.test(cc)) {
      throw new Error('security.allowed_countries must contain 2-letter uppercase ISO country codes');
    }
  }
  if (config.security.blocked_countries.length > 0 && config.security.allowed_countries.length > 0) {
    logger.warn('Both blocked_countries and allowed_countries are set; blocked_countries takes precedence');
  }

  // honeypots validation
  if (!Array.isArray(config.honeypots)) config.honeypots = [];
  for (const hp of config.honeypots) {
    if (typeof hp.path !== 'string' || !hp.path.startsWith('/')) {
      throw new Error('honeypots[].path must be a string starting with /');
    }
    if (!Number.isInteger(hp.ban_minutes) || hp.ban_minutes < 1) {
      throw new Error('honeypots[].ban_minutes must be a positive integer');
    }
  }

  // throttle defaults
  if (!config.throttle) config.throttle = {};
  if (config.throttle.warn_threshold === undefined) config.throttle.warn_threshold = 0.8;
  if (config.throttle.warn_delay_ms === undefined) config.throttle.warn_delay_ms = 200;
  if (config.throttle.critical_threshold === undefined) config.throttle.critical_threshold = 0.9;
  if (config.throttle.critical_delay_ms === undefined) config.throttle.critical_delay_ms = 500;

  // dashboard defaults
  if (!config.dashboard) config.dashboard = {};
  if (config.dashboard.enabled === undefined) config.dashboard.enabled = true;
  if (config.dashboard.max_events === undefined) config.dashboard.max_events = 1000;

  return config;
}

/**
 * Load and validate configuration from a JSON file.
 * @param {string} configPath - Path to config.json
 * @returns {Object} Validated configuration object
 * @throws {Error} On invalid JSON or failed validation
 */
export function loadConfig(configPath) {
  const resolved = path.resolve(configPath);
  const raw = fs.readFileSync(resolved, 'utf-8');
  const parsed = JSON.parse(raw);
  const validated = validateConfig(parsed);
  currentConfig = validated;
  return validated;
}

/**
 * Start watching the config file for changes. On change, reload, validate,
 * diff, emit event, and atomically swap the active config.
 * @param {string} configPath - Path to config.json
 * @param {import('events').EventEmitter} eventBus - Central event bus
 * @returns {Function} The getConfig function
 */
export function watchConfig(configPath, eventBus) {
  const resolved = path.resolve(configPath);
  let debounceTimer = null;

  fs.watch(resolved, (eventType) => {
    if (eventType !== 'change') return;

    // Debounce — only process the last event within 500ms
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      try {
        const raw = fs.readFileSync(resolved, 'utf-8');
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          logger.warn('Config reload failed: invalid JSON, keeping current config');
          return;
        }

        let validated;
        try {
          validated = validateConfig(parsed);
        } catch (err) {
          logger.warn('Config reload failed: validation error, keeping current config', { error: err.message });
          return;
        }

        const diffs = diffConfigs(currentConfig, validated);
        currentConfig = validated;

        eventBus.emit('config:reloaded', { diffs, timestamp: Date.now() });
        logger.info('Config reloaded successfully', { changes: diffs.length });
      } catch (err) {
        logger.warn('Config reload failed', { error: err.message });
      }
    }, 500);
  });

  return getConfig;
}

/**
 * Get the current active configuration object.
 * @returns {Object} Current config
 */
export function getConfig() {
  return currentConfig;
}
