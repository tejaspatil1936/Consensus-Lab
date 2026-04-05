(function() {
  'use strict';

  // ── DOM refs ──────────────────────────────────────────────
  var rpsEl        = document.getElementById('rps');
  var forwardedEl  = document.getElementById('total-forwarded');
  var blockedEl    = document.getElementById('total-blocked');
  var activeBansEl = document.getElementById('active-bans');
  var threatBarsEl = document.getElementById('threat-bars');
  var threatEmptyEl= document.getElementById('threat-empty');
  var threatTotalEl= document.getElementById('threat-total');
  var eventsEl     = document.getElementById('events');
  var feedEmptyEl  = document.getElementById('feed-empty');
  var statusPill   = document.getElementById('status-pill');
  var statusLabel  = document.getElementById('status-label');
  var configToast  = document.getElementById('config-toast');
  var configText   = document.getElementById('config-toast-text');
  var eventCountEl = document.getElementById('event-count');
  var clearBtn     = document.getElementById('clear-btn');
  var barChartEl   = document.getElementById('bar-chart');
  var uptimeTextEl = document.getElementById('uptime-text');

  // ── State ─────────────────────────────────────────────────
  var totalForwarded = 0;
  var totalBlocked   = 0;
  var activeBans     = [];
  var threatCounts   = {};
  var eventCount     = 0;
  var MAX_EVENTS     = 100;
  var startTime      = Date.now();
  var rpsTimestamps  = [];

  var THREAT_COLORS = {
    SQL_INJECTION:    '#dc2626',
    XSS:              '#ea580c',
    BRUTE_FORCE:      '#ca8a04',
    HONEYPOT_TRAP:    '#7c3aed',
    HIGH_ENTROPY:     '#2563eb',
    BLACKLISTED_IP:   '#6b7280',
    RATE_LIMITED:     '#d97706',
    HONEYPOT_BANNED:  '#7c3aed',
    OVERSIZED_PAYLOAD:'#db2777',
    BACKEND_ERROR:    '#6b7280'
  };

  // ── Chart data: 60 buckets ────────────────────────────────
  var chartData = [];
  for (var i = 0; i < 60; i++) chartData.push({ fwd: 0, blk: 0 });
  var currentSecond = Math.floor(Date.now() / 1000);

  // Build chart columns
  for (var b = 0; b < 60; b++) {
    var col = document.createElement('div');
    col.className = 'bar-col';
    col.innerHTML = '<div class="bar-blocked" style="height:0"></div>' +
                    '<div class="bar-forwarded" style="height:0"></div>';
    barChartEl.appendChild(col);
  }

  // ── SSE ───────────────────────────────────────────────────
  var eventSource = null;

  function connect() {
    eventSource = new EventSource('/events');

    eventSource.onopen = function() {
      statusPill.className = 'status-pill connected';
      statusLabel.textContent = 'Connected';
    };

    eventSource.onerror = function() {
      statusPill.className = 'status-pill disconnected';
      statusLabel.textContent = 'Disconnected';
      eventSource.close();
      setTimeout(connect, 3000);
    };

    eventSource.addEventListener('request:received', function() {
      rpsTimestamps.push(Date.now());
      bumpChart('fwd');
    });

    eventSource.addEventListener('request:forwarded', function(e) {
      var data = JSON.parse(e.data);
      totalForwarded++;
      animateValue(forwardedEl, totalForwarded);
      addEventRow(data, 'forwarded');
    });

    eventSource.addEventListener('request:blocked', function(e) {
      var data = JSON.parse(e.data);
      totalBlocked++;
      animateValue(blockedEl, totalBlocked);
      pulseEl(blockedEl);
      bumpChart('blk');

      if (data.threatTag) {
        threatCounts[data.threatTag] = (threatCounts[data.threatTag] || 0) + 1;
        renderThreatBars();
      }
      addEventRow(data, 'blocked');
    });

    eventSource.addEventListener('ip:banned', function(e) {
      var data = JSON.parse(e.data);
      activeBans.push({
        ip: data.ip,
        expiresAt: data.timestamp + (data.banMinutes * 60 * 1000)
      });
      animateValue(activeBansEl, activeBans.length);
    });

    eventSource.addEventListener('config:reloaded', function(e) {
      var data = JSON.parse(e.data);
      showConfigToast(data.diffs);
    });

    eventSource.addEventListener('rate-limit:warning', function(e) {
      var data = JSON.parse(e.data);
      addEventRow({
        ip: data.ip, method: '', path: data.path,
        threatTag: null, timestamp: data.timestamp
      }, 'warning');
    });
  }

  // ── Helpers ───────────────────────────────────────────────

  function animateValue(el, val) {
    el.textContent = val.toLocaleString();
  }

  function pulseEl(el) {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  // ── Chart ─────────────────────────────────────────────────

  function bumpChart(type) {
    var nowSec = Math.floor(Date.now() / 1000);
    advanceChart(nowSec);
    chartData[59][type]++;
  }

  function advanceChart(nowSec) {
    var diff = nowSec - currentSecond;
    if (diff <= 0) return;
    var shift = Math.min(diff, 60);
    for (var s = 0; s < shift; s++) {
      chartData.shift();
      chartData.push({ fwd: 0, blk: 0 });
    }
    currentSecond = nowSec;
  }

  function renderChart() {
    var cols = barChartEl.children;
    var maxVal = 1;
    for (var i = 0; i < 60; i++) {
      var t = chartData[i].fwd + chartData[i].blk;
      if (t > maxVal) maxVal = t;
    }
    for (var j = 0; j < 60; j++) {
      var col = cols[j];
      if (!col) continue;
      var blkBar = col.children[0];
      var fwdBar = col.children[1];
      var fwdH = chartData[j].fwd > 0 ? Math.max(3, (chartData[j].fwd / maxVal) * 100) : 0;
      var blkH = chartData[j].blk > 0 ? Math.max(3, (chartData[j].blk / maxVal) * 100) : 0;
      fwdBar.style.height = fwdH + '%';
      blkBar.style.height = blkH + '%';
    }
  }

  // ── Threat bars ───────────────────────────────────────────

  function renderThreatBars() {
    var tags = Object.keys(threatCounts);
    var totalThreats = 0;
    var maxCount = 1;
    for (var k = 0; k < tags.length; k++) {
      totalThreats += threatCounts[tags[k]];
      if (threatCounts[tags[k]] > maxCount) maxCount = threatCounts[tags[k]];
    }
    threatTotalEl.textContent = totalThreats + ' threat' + (totalThreats !== 1 ? 's' : '');
    tags.sort(function(a, b) { return threatCounts[b] - threatCounts[a]; });

    threatBarsEl.innerHTML = '';
    for (var t = 0; t < tags.length; t++) {
      var tag = tags[t];
      var count = threatCounts[tag];
      var pct = Math.round((count / maxCount) * 100);
      var color = THREAT_COLORS[tag] || '#6b7280';

      var row = document.createElement('div');
      row.className = 'threat-bar-row';
      row.style.animationDelay = (t * 40) + 'ms';
      row.innerHTML =
        '<span class="threat-bar-label">' + tag + '</span>' +
        '<div class="threat-bar-track"><div class="threat-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
        '<span class="threat-bar-count">' + count + '</span>';
      threatBarsEl.appendChild(row);
    }

    if (tags.length > 0) {
      threatEmptyEl.style.display = 'none';
    } else {
      threatEmptyEl.style.display = '';
    }
  }

  // ── Event rows ────────────────────────────────────────────

  function addEventRow(data, type) {
    if (feedEmptyEl) feedEmptyEl.style.display = 'none';

    eventCount++;
    eventCountEl.textContent = eventCount + ' event' + (eventCount !== 1 ? 's' : '');

    var row = document.createElement('div');
    row.className = 'event-row row-' + type;

    var time = data.timestamp
      ? new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' })
      : new Date().toLocaleTimeString('en-US', { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' });

    var statusHtml;
    if (type === 'forwarded') {
      statusHtml = '<span class="status-chip chip-fwd">FORWARDED</span>';
    } else if (type === 'blocked') {
      statusHtml = '<span class="status-chip chip-blocked">BLOCKED</span>';
    } else {
      statusHtml = '<span class="status-chip chip-throttle">THROTTLED</span>';
    }

    var method = data.method || '';
    var mClass = 'method-' + (method ? method.toLowerCase() : 'other');

    var tagHtml = '';
    if (data.threatTag) {
      tagHtml = '<span class="event-tag tag-' + data.threatTag + '">' + data.threatTag + '</span>';
    }

    row.innerHTML =
      '<span class="col-time">' + time + '</span>' +
      '<span class="col-status">' + statusHtml + '</span>' +
      '<span class="col-method ' + mClass + '">' + method + '</span>' +
      '<span class="col-ip">' + (data.ip || '') + '</span>' +
      '<span class="col-path" title="' + (data.path || '') + '">' + (data.path || '') + '</span>' +
      '<span class="col-tag">' + tagHtml + '</span>';

    if (eventsEl.firstChild) {
      eventsEl.insertBefore(row, eventsEl.firstChild);
    } else {
      eventsEl.appendChild(row);
    }

    var rows = eventsEl.querySelectorAll('.event-row');
    while (rows.length > MAX_EVENTS) {
      eventsEl.removeChild(rows[rows.length - 1]);
      rows = eventsEl.querySelectorAll('.event-row');
    }
  }

  // ── Config toast ──────────────────────────────────────────

  function showConfigToast(diffs) {
    if (!diffs || diffs.length === 0) return;
    var lines = diffs.map(function(d) {
      return d.field + ': ' + JSON.stringify(d.oldValue) + ' \u2192 ' + JSON.stringify(d.newValue);
    });
    configText.textContent = lines.join('; ');
    configToast.classList.remove('hidden');
    setTimeout(function() { configToast.classList.add('hidden'); }, 10000);
  }

  // ── Clear ─────────────────────────────────────────────────

  clearBtn.addEventListener('click', function() {
    var rows = eventsEl.querySelectorAll('.event-row');
    for (var r = 0; r < rows.length; r++) eventsEl.removeChild(rows[r]);
    eventCount = 0;
    eventCountEl.textContent = '0 events';
    if (feedEmptyEl) feedEmptyEl.style.display = '';
  });

  // ── Tick: 1s interval ─────────────────────────────────────

  setInterval(function() {
    var now = Date.now();

    // RPS
    var cutoff = now - 10000;
    while (rpsTimestamps.length > 0 && rpsTimestamps[0] < cutoff) rpsTimestamps.shift();
    var rps = Math.round((rpsTimestamps.length / 10) * 10) / 10;
    rpsEl.textContent = rps.toFixed(1);

    // Uptime
    var s = Math.floor((now - startTime) / 1000);
    if (s < 60) uptimeTextEl.textContent = s + 's uptime';
    else if (s < 3600) uptimeTextEl.textContent = Math.floor(s/60) + 'm ' + (s%60) + 's';
    else uptimeTextEl.textContent = Math.floor(s/3600) + 'h ' + Math.floor((s%3600)/60) + 'm';

    // Chart
    advanceChart(Math.floor(now / 1000));
    renderChart();

    // Bans
    activeBans = activeBans.filter(function(b) { return b.expiresAt > now; });
    activeBansEl.textContent = activeBans.length;
  }, 1000);

  // ── Go ────────────────────────────────────────────────────
  connect();
})();
