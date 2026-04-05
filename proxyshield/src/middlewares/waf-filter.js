import { calculateEntropy } from '../algorithms/entropy.js';

/** SQL injection detection pattern (case-insensitive) */
const sqlInjectionPattern = /(\b(union\s+(all\s+)?select|select\s+.*\s+from|insert\s+into|update\s+.*\s+set|delete\s+from|drop\s+(table|database|column)|alter\s+table|create\s+(table|database)|exec(\s+|\()|execute(\s+|\()|xp_|sp_)\b|(--)|(\/\*[\s\S]*?\*\/)|(\b(or|and)\s+\d+\s*=\s*\d+)|('\s*(or|and)\s+'?\d+'?\s*=\s*'?\d+)|(;\s*(drop|delete|update|insert|alter|create)))/i;

/** XSS detection pattern (case-insensitive) */
const xssPattern = /(<\s*script|<\s*iframe|<\s*embed|<\s*object|<\s*img\s+[^>]*\b(onerror|onload)\s*=|javascript\s*:|on(error|load|click|mouseover|focus|blur|submit|change|input|keydown|keyup|keypress)\s*=|eval\s*\(|document\s*\.\s*(cookie|write|location)|window\s*\.\s*(location|open)|alert\s*\(|prompt\s*\(|confirm\s*\()/i;

/** Content types where high entropy is expected (binary data) */
const BINARY_CONTENT_TYPES = ['multipart/form-data', 'application/octet-stream'];
const BINARY_TYPE_PREFIXES = ['image/', 'audio/', 'video/'];

/**
 * WAF (Web Application Firewall) middleware factory.
 * Scans request body, query parameters, and URL path for SQL injection,
 * XSS patterns, and high-entropy anomalies.
 *
 * @returns {Function} Middleware function with signature (req, res, context) => Promise<string>
 */
export function createWafFilter() {
  return async function wafFilter(req, res, context) {
    const { block_sql_injection, block_xss, entropy_threshold } = context.config.security;

    // Skip if both WAF features are disabled
    if (!block_sql_injection && !block_xss) return 'next';

    // Collect scannable content
    const scannable = [];

    // URL path
    scannable.push(req.url);

    // Query string values
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      for (const value of parsedUrl.searchParams.values()) {
        scannable.push(value);
      }
    } catch {
      // Malformed URL — skip query parsing
    }

    // Request body text
    if (context.bodyText) {
      scannable.push(context.bodyText);
    }

    // SQL Injection detection
    if (block_sql_injection) {
      for (const text of scannable) {
        if (sqlInjectionPattern.test(text)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden', reason: 'SQL_INJECTION' }));
          context.eventBus.emit('request:blocked', {
            ip: context.ip,
            method: req.method,
            path: req.url,
            reason: 'SQL injection detected',
            threatTag: 'SQL_INJECTION',
            timestamp: Date.now()
          });
          return 'stop';
        }
      }
    }

    // XSS detection
    if (block_xss) {
      for (const text of scannable) {
        if (xssPattern.test(text)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden', reason: 'XSS' }));
          context.eventBus.emit('request:blocked', {
            ip: context.ip,
            method: req.method,
            path: req.url,
            reason: 'XSS attack detected',
            threatTag: 'XSS',
            timestamp: Date.now()
          });
          return 'stop';
        }
      }
    }

    // Entropy-based anomaly detection (only on request bodies)
    if (context.bodyText && context.bodyText.length > 0) {
      const contentType = (req.headers['content-type'] || '').toLowerCase();

      // Skip binary content types
      const isBinary = BINARY_CONTENT_TYPES.some(t => contentType.includes(t)) ||
                       BINARY_TYPE_PREFIXES.some(p => contentType.startsWith(p));

      if (!isBinary) {
        const entropy = calculateEntropy(context.bodyText);
        if (entropy > entropy_threshold) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden', reason: 'HIGH_ENTROPY' }));
          context.eventBus.emit('request:blocked', {
            ip: context.ip,
            method: req.method,
            path: req.url,
            reason: 'High entropy payload detected',
            threatTag: 'HIGH_ENTROPY',
            timestamp: Date.now()
          });
          return 'stop';
        }
      }
    }

    return 'next';
  };
}
