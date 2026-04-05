import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createIpBlacklist } from '../src/middlewares/ip-blacklist.js';
import { createMockReq, createMockRes, createMockContext } from './helpers.js';

describe('IP Blacklist Middleware', () => {
  let runtimeBanMap;
  let middleware;

  beforeEach(() => {
    runtimeBanMap = new Map();
    middleware = createIpBlacklist(runtimeBanMap);
  });

  it('should return stop and 403 for a blacklisted IP', async () => {
    const req = createMockReq({ ip: '203.0.113.42' });
    const res = createMockRes();
    const context = createMockContext({ ip: '203.0.113.42' });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'stop');
    assert.strictEqual(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.reason, 'BLACKLISTED_IP');
  });

  it('should return next for a non-blacklisted IP', async () => {
    const req = createMockReq({ ip: '10.0.0.1' });
    const res = createMockRes();
    const context = createMockContext({ ip: '10.0.0.1' });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });

  it('should return stop and 403 for a runtime-banned IP', async () => {
    runtimeBanMap.set('192.168.1.100', {
      bannedAt: Date.now(),
      banDurationMs: 30 * 60 * 1000
    });

    const req = createMockReq({ ip: '192.168.1.100' });
    const res = createMockRes();
    const context = createMockContext({ ip: '192.168.1.100' });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'stop');
    assert.strictEqual(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.reason, 'HONEYPOT_BANNED');
  });

  it('should return next for an expired runtime ban', async () => {
    runtimeBanMap.set('192.168.1.100', {
      bannedAt: Date.now() - 60 * 60 * 1000,
      banDurationMs: 30 * 60 * 1000
    });

    const req = createMockReq({ ip: '192.168.1.100' });
    const res = createMockRes();
    const context = createMockContext({ ip: '192.168.1.100' });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
    assert.strictEqual(runtimeBanMap.has('192.168.1.100'), false);
  });

  it('should emit request:blocked event when blocking', async () => {
    const req = createMockReq({ ip: '203.0.113.42', url: '/test' });
    const res = createMockRes();
    let emittedEvent = null;
    const context = createMockContext({
      ip: '203.0.113.42',
      eventBus: { emit: (name, data) => { emittedEvent = { name, data }; } }
    });

    await middleware(req, res, context);
    assert.ok(emittedEvent);
    assert.strictEqual(emittedEvent.name, 'request:blocked');
    assert.strictEqual(emittedEvent.data.threatTag, 'BLACKLISTED_IP');
  });
});
