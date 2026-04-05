import http from 'http';
import logger from '../utils/logger.js';

/**
 * Forward an HTTP request from the client to the backend server and stream the response back.
 * This is the last step in the middleware pipeline.
 *
 * @param {http.IncomingMessage} req - The client request
 * @param {http.ServerResponse} res - The client response
 * @param {string} backendUrl - The backend server URL (e.g. "http://localhost:8080")
 * @param {import('events').EventEmitter} eventBus - Central event bus
 * @param {Buffer|null} bodyBuffer - Pre-read request body (null for bodyless methods)
 * @param {string} clientIp - The client's IP address
 */
export function forwardRequest(req, res, backendUrl, eventBus, bodyBuffer, clientIp) {
  try {
    const backend = new URL(backendUrl);
    const startTime = Date.now();

    // Build headers — copy all, replace host, add forwarding headers
    const headers = { ...req.headers };
    headers.host = backend.host;

    // X-Forwarded-For
    const existingXff = headers['x-forwarded-for'];
    const remoteAddr = clientIp || req.socket.remoteAddress;
    headers['x-forwarded-for'] = existingXff ? `${existingXff}, ${remoteAddr}` : remoteAddr;

    // X-Forwarded-Proto and X-Forwarded-Host
    headers['x-forwarded-proto'] = 'http';
    headers['x-forwarded-host'] = req.headers.host || backend.host;

    const options = {
      hostname: backend.hostname,
      port: backend.port || 80,
      path: req.url,
      method: req.method,
      headers
    };

    const backendReq = http.request(options, (backendRes) => {
      // Copy status code and headers to client response
      res.writeHead(backendRes.statusCode, backendRes.headers);
      // Stream response body
      backendRes.pipe(res);
    });

    // 30-second timeout
    backendReq.setTimeout(30000, () => {
      backendReq.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Gateway timeout' }));
      }
    });

    // Record timing on response finish
    res.on('finish', () => {
      const latencyMs = Date.now() - startTime;
      eventBus.emit('request:forwarded', {
        ip: clientIp || req.socket.remoteAddress,
        method: req.method,
        path: req.url,
        statusCode: res.statusCode,
        latencyMs,
        timestamp: Date.now()
      });
    });

    // Client disconnect — abort backend request
    req.on('close', () => {
      if (req.destroyed) {
        backendReq.destroy();
      }
    });

    // Backend connection errors
    backendReq.on('error', (err) => {
      logger.error('Backend request failed', { error: err.message, code: err.code });
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Backend unavailable' }));
      }
      eventBus.emit('request:blocked', {
        ip: clientIp || req.socket.remoteAddress,
        method: req.method,
        path: req.url,
        reason: 'BACKEND_DOWN',
        threatTag: 'BACKEND_ERROR',
        timestamp: Date.now()
      });
    });

    // Send body or end request
    if (bodyBuffer && bodyBuffer.length > 0) {
      backendReq.write(bodyBuffer);
      backendReq.end();
    } else {
      backendReq.end();
    }
  } catch (err) {
    logger.error('Forwarder error', { error: err.message });
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend unavailable' }));
    }
  }
}
