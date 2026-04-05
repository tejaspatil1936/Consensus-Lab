import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createHoneypot } from '../src/middlewares/honeypot.js';
import { createMockReq, createMockRes, createMockContext } from './helpers.js';

describe('Honeypot Middleware', () => {
  let runtimeBanMap;
  let middleware;

  beforeEach(() => {
    runtimeBanMap = new Map();
    middleware = createHoneypot(runtimeBanMap);
  });

  it('should return stop and 403 for a honeypot path', async () => {
    const req = createMockReq({ url: '/admin' });
    const res = createMockRes();
    const context = createMockContext();

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'stop');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(JSON.parse(res.body).reason, 'HONEYPOT_TRAP');
  });

  it('should add the IP to the runtime ban map', async () => {
    const req = createMockReq({ url: '/admin' });
    const res = createMockRes();
    const context = createMockContext({ ip: '10.0.0.5' });

    await middleware(req, res, context);
    assert.ok(runtimeBanMap.has('10.0.0.5'));
    assert.strictEqual(runtimeBanMap.get('10.0.0.5').banDurationMs, 30 * 60 * 1000);
  });

  it('should return next for a non-honeypot path', async () => {
    const req = createMockReq({ url: '/getAllUsers' });
    const res = createMockRes();
    const context = createMockContext();

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });

  it('should emit ip:banned event', async () => {
    const req = createMockReq({ url: '/admin' });
    const res = createMockRes();
    const events = [];
    const context = createMockContext({
      ip: '10.0.0.5',
      eventBus: { emit: (name, data) => events.push({ name, data }) }
    });

    await middleware(req, res, context);
    const banned = events.find(e => e.name === 'ip:banned');
    assert.ok(banned);
    assert.strictEqual(banned.data.ip, '10.0.0.5');
    assert.strictEqual(banned.data.banMinutes, 30);
  });

  it('should emit request:blocked event with HONEYPOT_TRAP tag', async () => {
    const req = createMockReq({ url: '/.env' });
    const res = createMockRes();
    const events = [];
    const context = createMockContext({
      eventBus: { emit: (name, data) => events.push({ name, data }) }
    });

    await middleware(req, res, context);
    const blocked = events.find(e => e.name === 'request:blocked');
    assert.ok(blocked);
    assert.strictEqual(blocked.data.threatTag, 'HONEYPOT_TRAP');
  });

  it('should handle paths with query strings', async () => {
    const req = createMockReq({ url: '/admin?foo=bar' });
    const res = createMockRes();
    const context = createMockContext();

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'stop');
    assert.strictEqual(res.statusCode, 403);
  });
});
