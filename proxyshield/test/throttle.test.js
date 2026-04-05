import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createThrottle } from '../src/middlewares/throttle.js';
import { createMockReq, createMockRes, createMockContext } from './helpers.js';

describe('Throttle Middleware', () => {
  const middleware = createThrottle();

  it('should return next immediately when rateLimitInfo is null', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const context = createMockContext({ rateLimitInfo: null });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });

  it('should return next immediately when throttle is not enabled', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const context = createMockContext({
      rateLimitInfo: { current: 4, limit: 5, remaining: 1, resetTime: Date.now() + 60000, throttleEnabled: false, path: '/login' }
    });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });

  it('should return next without delay when usage is below warn threshold', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const context = createMockContext({
      rateLimitInfo: { current: 2, limit: 5, remaining: 3, resetTime: Date.now() + 60000, throttleEnabled: true, path: '/login' }
    });

    const start = Date.now();
    const result = await middleware(req, res, context);
    const elapsed = Date.now() - start;

    assert.strictEqual(result, 'next');
    assert.ok(elapsed < 50, `Expected no delay but took ${elapsed}ms`);
  });

  it('should add warn delay when usage is between 80% and 90%', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const context = createMockContext({
      rateLimitInfo: { current: 85, limit: 100, remaining: 15, resetTime: Date.now() + 60000, throttleEnabled: true, path: '/login' }
    });

    const start = Date.now();
    const result = await middleware(req, res, context);
    const elapsed = Date.now() - start;

    assert.strictEqual(result, 'next');
    assert.ok(elapsed >= 150, `Expected ~200ms delay but got ${elapsed}ms`);
  });

  it('should add critical delay when usage is above 90%', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const context = createMockContext({
      rateLimitInfo: { current: 95, limit: 100, remaining: 5, resetTime: Date.now() + 60000, throttleEnabled: true, path: '/login' }
    });

    const start = Date.now();
    const result = await middleware(req, res, context);
    const elapsed = Date.now() - start;

    assert.strictEqual(result, 'next');
    assert.ok(elapsed >= 400, `Expected ~500ms delay but got ${elapsed}ms`);
  });

  it('should emit rate-limit:warning event when throttling', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const events = [];
    const context = createMockContext({
      rateLimitInfo: { current: 85, limit: 100, remaining: 15, resetTime: Date.now() + 60000, throttleEnabled: true, path: '/login' },
      eventBus: { emit: (name, data) => events.push({ name, data }) }
    });

    await middleware(req, res, context);
    const warning = events.find(e => e.name === 'rate-limit:warning');
    assert.ok(warning);
    assert.strictEqual(warning.data.usagePercent, 85);
    assert.ok(warning.data.delayMs > 0);
  });

  it('should never return stop (throttle only delays, never blocks)', async () => {
    const req = createMockReq();
    const res = createMockRes();
    const context = createMockContext({
      rateLimitInfo: { current: 99, limit: 100, remaining: 1, resetTime: Date.now() + 60000, throttleEnabled: true, path: '/login' }
    });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });
});
