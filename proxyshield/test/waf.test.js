import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createWafFilter } from '../src/middlewares/waf-filter.js';
import { createMockReq, createMockRes, createMockContext } from './helpers.js';

describe('WAF Filter Middleware', () => {
  const middleware = createWafFilter();

  it('should block SQL injection in request body', async () => {
    const req = createMockReq({ method: 'POST', url: '/search' });
    const res = createMockRes();
    const context = createMockContext({ bodyText: "' OR 1=1 --" });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'stop');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(JSON.parse(res.body).reason, 'SQL_INJECTION');
  });

  it('should block SQL injection in query parameters', async () => {
    const req = createMockReq({ url: '/users?id=1 UNION SELECT * FROM passwords' });
    const res = createMockRes();
    const context = createMockContext();

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'stop');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(JSON.parse(res.body).reason, 'SQL_INJECTION');
  });

  it('should block XSS script tag', async () => {
    const req = createMockReq({ url: '/search?q=<script>alert("xss")</script>' });
    const res = createMockRes();
    const context = createMockContext();

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'stop');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(JSON.parse(res.body).reason, 'XSS');
  });

  it('should block XSS event handler', async () => {
    const req = createMockReq({ url: '/search?q=<img onerror=alert(1) src=x>' });
    const res = createMockRes();
    const context = createMockContext();

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'stop');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(JSON.parse(res.body).reason, 'XSS');
  });

  it('should allow normal requests', async () => {
    const req = createMockReq({ url: '/getAllUsers' });
    const res = createMockRes();
    const context = createMockContext();

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });

  it('should block high-entropy payloads', async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let highEntropy = '';
    for (let i = 0; i < 200; i++) {
      highEntropy += chars[Math.floor(Math.random() * chars.length)];
    }

    const req = createMockReq({ method: 'POST', url: '/data' });
    const res = createMockRes();
    const context = createMockContext({ bodyText: highEntropy });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'stop');
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(JSON.parse(res.body).reason, 'HIGH_ENTROPY');
  });

  it('should allow normal form data', async () => {
    const req = createMockReq({ method: 'POST', url: '/login' });
    const res = createMockRes();
    const context = createMockContext({ bodyText: 'username=alice&password=secret123' });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });

  it('should skip entropy check for multipart/form-data content type', async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let highEntropy = '';
    for (let i = 0; i < 200; i++) {
      highEntropy += chars[Math.floor(Math.random() * chars.length)];
    }

    const req = createMockReq({
      method: 'POST',
      url: '/upload',
      headers: { 'content-type': 'multipart/form-data; boundary=----FormBoundary' }
    });
    const res = createMockRes();
    const context = createMockContext({ bodyText: highEntropy });

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });

  it('should respect config toggles — SQL injection passes when disabled', async () => {
    const req = createMockReq({ method: 'POST', url: '/search' });
    const res = createMockRes();
    const context = createMockContext({ bodyText: "' OR 1=1 --" });
    context.config.security.block_sql_injection = false;
    context.config.security.block_xss = false;

    const result = await middleware(req, res, context);
    assert.strictEqual(result, 'next');
  });
});
