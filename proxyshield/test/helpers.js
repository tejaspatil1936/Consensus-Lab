/**
 * Create a mock HTTP request object for testing.
 * @param {Object} [options] - Request options
 * @returns {Object} Mock request
 */
export function createMockReq(options = {}) {
  return {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: options.headers || {},
    socket: { remoteAddress: options.ip || '127.0.0.1' },
    body: options.body || null,
    bodyText: options.bodyText || null,
    on: () => {},
    destroy: () => {}
  };
}

/**
 * Create a mock HTTP response object for testing.
 * @returns {Object} Mock response with statusCode, headers, body, ended
 */
export function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    ended: false,
    writeHead(code, headers) {
      res.statusCode = code;
      if (typeof headers === 'object') Object.assign(res.headers, headers);
    },
    end(body) {
      res.body = body;
      res.ended = true;
    },
    setHeader(key, value) {
      res.headers[key] = value;
    },
    write() {},
    on() {}
  };
  return res;
}

/**
 * Create a mock context object for testing middlewares.
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} Mock context
 */
export function createMockContext(overrides = {}) {
  return {
    config: {
      security: {
        block_sql_injection: true,
        block_xss: true,
        entropy_threshold: 5.5,
        max_body_bytes: 1048576,
        blacklisted_ips: ['203.0.113.42']
      },
      rate_limits: [
        { path: '/login', method: 'POST', limit: 5, window_seconds: 60, algorithm: 'sliding_window', throttle_enabled: true },
        { path: '/getAllUsers', method: 'GET', limit: 100, window_seconds: 60, algorithm: 'token_bucket', throttle_enabled: false }
      ],
      honeypots: [
        { path: '/admin', ban_minutes: 30 },
        { path: '/.env', ban_minutes: 60 }
      ],
      throttle: { warn_threshold: 0.8, warn_delay_ms: 200, critical_threshold: 0.9, critical_delay_ms: 500 }
    },
    eventBus: { emit: () => {} },
    ip: overrides.ip || '127.0.0.1',
    startTime: Date.now(),
    rateLimitInfo: overrides.rateLimitInfo || null,
    body: overrides.body || null,
    bodyText: overrides.bodyText || null,
    ...overrides
  };
}
