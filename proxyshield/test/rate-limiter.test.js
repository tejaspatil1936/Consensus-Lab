import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createRateLimiter } from '../src/middlewares/rate-limiter.js';
import { TokenBucket } from '../src/algorithms/token-bucket.js';
import { SlidingWindow } from '../src/algorithms/sliding-window.js';
import { createMockReq, createMockRes, createMockContext } from './helpers.js';

describe('Rate Limiter Middleware', () => {
  let tokenBucket;
  let slidingWindow;
  let middleware;

  beforeEach(() => {
    tokenBucket = new TokenBucket();
    slidingWindow = new SlidingWindow();
    middleware = createRateLimiter(tokenBucket, slidingWindow);
  });

  it('should allow requests under the limit', async () => {
    const req = createMockReq({ method: 'POST', url: '/login' });
    const res = createMockRes();
    const context = createMockContext({ ip: '10.0.0.1' });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });

  it('should block requests over the limit with 429', async () => {
    for (let i = 0; i < 5; i++) {
      const req = createMockReq({ method: 'POST', url: '/login' });
      const res = createMockRes();
      const context = createMockContext({ ip: '10.0.0.1' });
      await middleware(req, res, context);
    }

    const req = createMockReq({ method: 'POST', url: '/login' });
    const res = createMockRes();
    const context = createMockContext({ ip: '10.0.0.1' });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'stop');
    assert.strictEqual(res.statusCode, 429);
  });

  it('should track limits per IP', async () => {
    for (let i = 0; i < 5; i++) {
      const req = createMockReq({ method: 'POST', url: '/login' });
      const res = createMockRes();
      const context = createMockContext({ ip: '10.0.0.1' });
      await middleware(req, res, context);
    }

    const req = createMockReq({ method: 'POST', url: '/login' });
    const res = createMockRes();
    const context = createMockContext({ ip: '10.0.0.2' });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });

  it('should track limits per endpoint', async () => {
    for (let i = 0; i < 5; i++) {
      const req = createMockReq({ method: 'POST', url: '/login' });
      const res = createMockRes();
      const context = createMockContext({ ip: '10.0.0.1' });
      await middleware(req, res, context);
    }

    const req = createMockReq({ method: 'GET', url: '/getAllUsers' });
    const res = createMockRes();
    const context = createMockContext({ ip: '10.0.0.1' });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });

  it('should return next for endpoints with no rate limit rule', async () => {
    const req = createMockReq({ method: 'GET', url: '/health' });
    const res = createMockRes();
    const context = createMockContext({ ip: '10.0.0.1' });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });

  it('should set rateLimitInfo on context', async () => {
    const req = createMockReq({ method: 'POST', url: '/login' });
    const res = createMockRes();
    const context = createMockContext({ ip: '10.0.0.1' });

    await middleware(req, res, context);
    assert.ok(context.rateLimitInfo);
    assert.strictEqual(context.rateLimitInfo.limit, 5);
    assert.ok(typeof context.rateLimitInfo.remaining === 'number');
  });

  it('should include rate limit headers in 429 response', async () => {
    for (let i = 0; i < 5; i++) {
      const req = createMockReq({ method: 'POST', url: '/login' });
      const res = createMockRes();
      const context = createMockContext({ ip: '10.0.0.1' });
      await middleware(req, res, context);
    }

    const req = createMockReq({ method: 'POST', url: '/login' });
    const res = createMockRes();
    const context = createMockContext({ ip: '10.0.0.1' });

    await middleware(req, res, context);
    assert.ok(res.headers['Retry-After']);
    assert.ok(res.headers['X-RateLimit-Limit']);
    assert.strictEqual(res.headers['X-RateLimit-Remaining'], '0');
  });

  it('should use token_bucket algorithm when configured', async () => {
    const req = createMockReq({ method: 'GET', url: '/getAllUsers' });
    const res = createMockRes();
    const context = createMockContext({ ip: '10.0.0.1' });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
    assert.ok(context.rateLimitInfo);
    assert.strictEqual(context.rateLimitInfo.limit, 100);
  });

  it('should use sliding_window algorithm when configured', async () => {
    const req = createMockReq({ method: 'POST', url: '/login' });
    const res = createMockRes();
    const context = createMockContext({ ip: '10.0.0.1' });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
    assert.ok(context.rateLimitInfo);
    assert.strictEqual(context.rateLimitInfo.limit, 5);
  });
});
