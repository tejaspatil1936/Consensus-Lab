import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createGeoBlocker } from '../src/middlewares/geo-blocker.js';
import { lookupCountry } from '../src/data/geo-ip.js';
import { createMockReq, createMockRes, createMockContext } from './helpers.js';

// Helper: build a context with custom geo config
function makeContext(overrides = {}, securityOverrides = {}) {
  const ctx = createMockContext(overrides);
  ctx.config = {
    ...ctx.config,
    security: {
      ...ctx.config.security,
      blocked_countries: [],
      allowed_countries: [],
      ...securityOverrides
    }
  };
  return ctx;
}

describe('Geo-IP Blocker Middleware', () => {
  it('should return next when no rules are configured', async () => {
    const mw = createGeoBlocker();
    const req = createMockReq();
    const res = createMockRes();
    const ctx = makeContext({ ip: '42.1.2.3' }); // CN IP

    const result = await mw(req, res, ctx);
    assert.strictEqual(result, 'next');
    assert.strictEqual(res.ended, false);
  });

  it('should block an IP from a blocked country', async () => {
    const mw = createGeoBlocker();
    const req = createMockReq({ url: '/api/data' });
    const res = createMockRes();
    // 42.x.x.x is in the CN block
    const ctx = makeContext({ ip: '42.1.2.3' }, { blocked_countries: ['CN'] });

    const result = await mw(req, res, ctx);
    assert.strictEqual(result, 'stop');
    assert.strictEqual(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.reason, 'GEO_BLOCKED');
    assert.strictEqual(body.country, 'CN');
  });

  it('should allow an IP from a non-blocked country', async () => {
    const mw = createGeoBlocker();
    const req = createMockReq();
    const res = createMockRes();
    // 8.8.8.8 is not in any blocked block in our dataset
    const ctx = makeContext({ ip: '8.8.8.8' }, { blocked_countries: ['CN', 'RU'] });

    const result = await mw(req, res, ctx);
    assert.strictEqual(result, 'next');
    assert.strictEqual(res.ended, false);
  });

  it('should emit request:blocked event when blocking', async () => {
    const mw = createGeoBlocker();
    const req = createMockReq({ url: '/secret', method: 'POST' });
    const res = createMockRes();
    let emitted = null;
    const ctx = makeContext(
      { ip: '42.1.2.3', eventBus: { emit: (name, data) => { emitted = { name, data }; } } },
      { blocked_countries: ['CN'] }
    );

    await mw(req, res, ctx);
    assert.ok(emitted, 'should have emitted an event');
    assert.strictEqual(emitted.name, 'request:blocked');
    assert.strictEqual(emitted.data.threatTag, 'GEO_BLOCKED');
    assert.strictEqual(emitted.data.ip, '42.1.2.3');
    assert.strictEqual(emitted.data.path, '/secret');
    assert.ok(emitted.data.reason.includes('CN'));
  });

  it('should never block private/loopback IPs', async () => {
    const mw = createGeoBlocker();
    const privateIps = ['127.0.0.1', '10.0.0.1', '192.168.1.100', '172.16.0.5'];
    for (const ip of privateIps) {
      const req = createMockReq();
      const res = createMockRes();
      const ctx = makeContext({ ip }, { blocked_countries: ['CN', 'RU', 'KP', 'IR'] });
      const result = await mw(req, res, ctx);
      assert.strictEqual(result, 'next', `${ip} should not be blocked`);
    }
  });

  it('should use allow-list mode when only allowed_countries is set', async () => {
    const mw = createGeoBlocker();

    // An IP from CN should be blocked if only 'US' is allowed
    const req1 = createMockReq();
    const res1 = createMockRes();
    const ctx1 = makeContext({ ip: '42.1.2.3' }, { allowed_countries: ['US', 'GB'] });
    const result1 = await mw(req1, res1, ctx1);
    assert.strictEqual(result1, 'stop');
    assert.strictEqual(res1.statusCode, 403);
    const body1 = JSON.parse(res1.body);
    assert.strictEqual(body1.reason, 'GEO_BLOCKED');

    // An unknown IP should still pass in allow-list mode
    const req2 = createMockReq();
    const res2 = createMockRes();
    const ctx2 = makeContext({ ip: '8.8.8.8' }, { allowed_countries: ['US', 'GB'] });
    const result2 = await mw(req2, res2, ctx2);
    // 8.8.8.8 is not in our dataset so it's 'unknown' — never blocked
    assert.strictEqual(result2, 'next');
  });

  it('should use blocked_countries when both lists are set', async () => {
    const mw = createGeoBlocker();
    // blocked_countries takes precedence; CN is blocked
    const req = createMockReq();
    const res = createMockRes();
    const ctx = makeContext(
      { ip: '42.1.2.3' },
      { blocked_countries: ['CN'], allowed_countries: ['CN'] }
    );
    const result = await mw(req, res, ctx);
    assert.strictEqual(result, 'stop');
  });

  it('should pass unknown IPs without blocking', async () => {
    const mw = createGeoBlocker();
    const req = createMockReq();
    const res = createMockRes();
    // 203.0.113.1 is TEST-NET-3, not in our dataset
    const ctx = makeContext({ ip: '203.0.113.1' }, { blocked_countries: ['CN', 'RU'] });
    const result = await mw(req, res, ctx);
    assert.strictEqual(result, 'next');
  });
});

describe('lookupCountry helper', () => {
  it('should return private for loopback', () => {
    assert.strictEqual(lookupCountry('127.0.0.1'), 'private');
  });

  it('should return private for RFC 1918 addresses', () => {
    assert.strictEqual(lookupCountry('10.10.10.10'), 'private');
    assert.strictEqual(lookupCountry('192.168.0.1'), 'private');
    assert.strictEqual(lookupCountry('172.16.5.5'), 'private');
  });

  it('should return CN for a known China IP', () => {
    // 42.1.1.1 is in the 42.0.0.0/8 CN block
    assert.strictEqual(lookupCountry('42.1.1.1'), 'CN');
  });

  it('should return RU for a known Russia IP', () => {
    // 5.8.0.1 is in the 5.8.0.0/13 RU block
    assert.strictEqual(lookupCountry('5.8.0.1'), 'RU');
  });

  it('should return KP for a known North Korea IP', () => {
    // 77.94.160.1 is in the 77.94.160.0/22 KP block (state broadcaster range)
    assert.strictEqual(lookupCountry('77.94.160.1'), 'KP');
  });

  it('should return IR for a known Iran IP', () => {
    // 5.22.0.1 is in the 5.22.0.0/16 IR block
    assert.strictEqual(lookupCountry('5.22.0.1'), 'IR');
  });

  it('should return BY for a known Belarus IP', () => {
    // 77.121.0.1 is in the 77.121.0.0/16 BY block
    assert.strictEqual(lookupCountry('77.121.0.1'), 'BY');
  });

  it('should return unknown for an IP not in the dataset', () => {
    // 8.8.8.8 (Google DNS) is not in our CIDR dataset
    assert.strictEqual(lookupCountry('8.8.8.8'), 'unknown');
  });

  it('should return unknown for invalid input', () => {
    assert.strictEqual(lookupCountry(''), 'unknown');
    assert.strictEqual(lookupCountry(null), 'unknown');
    assert.strictEqual(lookupCountry('::1'), 'private');
  });
});
