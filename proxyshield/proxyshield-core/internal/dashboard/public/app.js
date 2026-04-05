'use strict';

const MAX_EVENTS = 100;
const STATS_INTERVAL = 2000;
const RECONNECT_DELAY = 3000;

let events = [];
let es = null;
let statsTimer = null;

const threatTagClass = {
  SQL_INJECTION: 'tag-sql',
  XSS: 'tag-xss',
  BRUTE_FORCE: 'tag-brute',
  HONEYPOT_TRAP: 'tag-honeypot',
  HIGH_ENTROPY: 'tag-entropy',
  BLACKLISTED_IP: 'tag-blacklist',
  BANNED_IP: 'tag-banned',
  RATE_LIMITED: 'tag-ratelimit',
};

function el(id) { return document.getElementById(id); }

function setStatus(connected) {
  const dot = el('status-dot');
  const text = el('status-text');
  if (connected) {
    dot.className = 'status-indicator connected';
    text.textContent = 'Live';
  } else {
    dot.className = 'status-indicator disconnected';
    text.textContent = 'Disconnected — reconnecting...';
  }
}

function formatTime(ts) {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatLatency(ms) {
  if (ms == null) return '';
  return ms.toFixed(1) + 'ms';
}

function formatUptime(seconds) {
  if (seconds < 60) return Math.floor(seconds) + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + Math.floor(seconds % 60) + 's';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h + 'h ' + m + 'm';
}

function renderThreatTag(tag) {
  if (!tag) return '';
  const cls = threatTagClass[tag] || 'tag-ratelimit';
  return `<span class="threat-tag ${cls}">${tag}</span>`;
}

function renderStatusPill(eventName) {
  if (eventName === 'request:forwarded') return '<span class="status-pill pill-fwd">FWD</span>';
  if (eventName === 'request:blocked') return '<span class="status-pill pill-blocked">BLOCKED</span>';
  return '<span class="status-pill pill-received">RCV</span>';
}

function addEvent(evt) {
  events.unshift(evt);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  renderFeed();
}

function renderFeed() {
  const tbody = el('event-feed');
  const rows = events.map(evt => {
    const data = evt.data || {};
    return `<tr>
      <td class="cell-time">${formatTime(evt.timestamp)}</td>
      <td>${renderStatusPill(evt.name)}</td>
      <td class="cell-ip">${data.ip || '—'}</td>
      <td class="cell-path">${data.path || '—'}</td>
      <td>${renderThreatTag(data.threatTag || '')}</td>
      <td class="cell-latency">${data.latency_ms != null ? formatLatency(data.latency_ms) : ''}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

function clearFeed() {
  events = [];
  renderFeed();
}

function updateStats(stats) {
  el('stat-rps').textContent = stats.requestsPerSecond.toFixed(1);
  el('stat-forwarded').textContent = stats.totalForwarded.toLocaleString();
  el('stat-blocked').textContent = stats.totalBlocked.toLocaleString();
  el('stat-bans').textContent = stats.activeBans.toLocaleString();
  el('stat-uptime').textContent = formatUptime(stats.uptimeSeconds);

  const byType = stats.blockedByType || {};
  const keys = ['SQL_INJECTION', 'XSS', 'BRUTE_FORCE', 'HONEYPOT_TRAP', 'HIGH_ENTROPY', 'BLACKLISTED_IP', 'RATE_LIMITED'];
  keys.forEach(k => {
    const elem = el('threat-' + k);
    if (elem) elem.textContent = (byType[k] || 0).toLocaleString();
  });
}

async function fetchStats() {
  try {
    const res = await fetch('/stats');
    if (res.ok) {
      const data = await res.json();
      updateStats(data);
    }
  } catch (_) {}
}

function connect() {
  if (es) { try { es.close(); } catch(_) {} }

  es = new EventSource('/events');

  es.onopen = () => setStatus(true);

  es.onerror = () => {
    setStatus(false);
    es.close();
    setTimeout(connect, RECONNECT_DELAY);
  };

  // Listen for all known event types
  const knownEvents = [
    'request:received',
    'request:forwarded',
    'request:blocked',
    'ip:banned',
    'config:reloaded',
    'rate-limit:warning',
  ];

  knownEvents.forEach(name => {
    es.addEventListener(name, e => {
      let data = {};
      try { data = JSON.parse(e.data); } catch(_) {}
      addEvent({ name, data, timestamp: new Date().toISOString() });
    });
  });
}

// Init
connect();
fetchStats();
statsTimer = setInterval(fetchStats, STATS_INTERVAL);
