'use strict';

(function dashboard() {
  const $ = (id) => document.getElementById(id);
  const errEl = $('dash-error');
  let current = window.HEATWATCH_PROFILE_LOCATION; // {latitude, longitude} or null

  function showError(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function clearError() {
    errEl.hidden = true;
  }

  function fmt(v, unit, digits = 1) {
    return v === null || v === undefined ? 'unavailable' : `${Number(v).toFixed(digits)} ${unit}`;
  }

  function setChip(id, state) {
    const el = $(id);
    if (!el) return;
    el.textContent = state || '—';
    el.dataset.state = state || '';
  }

  // Smooth number ticker animation
  function animateValue(el, start, end, duration = 800, decimals = 1) {
    if (!el || isNaN(end)) return;
    const startTime = performance.now();
    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const currentVal = start + (end - start) * ease;
      el.textContent = currentVal.toFixed(decimals);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function renderResult(r) {
    if ($('loc-label')) {
      $('loc-label').textContent = `${r.latitude.toFixed(3)}, ${r.longitude.toFixed(3)}`;
    }

    if ($('w-temp')) $('w-temp').textContent = fmt(r.temperature, '°C');
    if ($('w-rh')) $('w-rh').textContent = fmt(r.relativeHumidity, '%', 0);
    if ($('w-wind')) $('w-wind').textContent = fmt(r.windSpeed, 'm/s');
    if ($('w-rad')) $('w-rad').textContent = fmt(r.radiation, 'W/m²', 0);
    if ($('w-vp')) $('w-vp').textContent = fmt(r.vapourPressure, 'kPa', 2);
    if ($('w-tmrt')) $('w-tmrt').textContent = fmt(r.tmrt, '°C');
    if ($('w-utci')) $('w-utci').textContent = fmt(r.utci, '°C');
    if ($('w-utci-cat')) $('w-utci-cat').textContent = r.utciCategory || 'unavailable';
    if ($('w-source')) $('w-source').textContent = r.source + (r.fallbackUsed ? ' (fallback)' : '');
    if ($('w-updated')) $('w-updated').textContent = new Date(r.timestamp).toLocaleString();

    setChip('w-status', r.dataStatus);
    setChip('w-tmrt-status', r.tmrtStatus);
    setChip('w-utci-status', r.utciStatus);

    const notes = (r.notes || []).join(' ');
    if ($('w-notes')) {
      $('w-notes').textContent = notes;
      $('w-notes').hidden = !notes;
    }

    // Risk panel
    const colors = window.HEATWATCH_RISK_COLORS || {};
    if (r.htsi !== null && r.htsi !== undefined) {
      const htsiEl = $('r-htsi');
      const prevVal = parseFloat(htsiEl.textContent) || 0;
      animateValue(htsiEl, prevVal, r.htsi, 600, 1);

      const lvl = $('r-level');
      lvl.textContent = r.riskLevel;
      const riskColor = colors[r.riskLevel] || '#10b981';
      lvl.style.background = riskColor;
      lvl.style.color = '#fff';
      lvl.style.boxShadow = `0 0 16px ${riskColor}`;

      // Update 3D Holographic Gauge
      if (window.HW_3D && window.HW_3D.updateGauge) {
        window.HW_3D.updateGauge(r.htsi, r.riskLevel, riskColor);
      }

      $('r-method').textContent =
        r.htsiMethod === 'random_forest'
          ? `Random Forest model v${r.modelInfo && r.modelInfo.modelVersion ? r.modelInfo.modelVersion : '?'} (labels: synthetic rules — prototype)`
          : 'Transparent rule engine (prototype)';

      const marker = $('r-marker');
      if (marker) {
        marker.style.left = `${Math.min(100, Math.max(0, r.htsi))}%`;
        marker.style.boxShadow = `0 0 10px ${riskColor}`;
      }

      const list = $('r-factors');
      if (list) {
        list.innerHTML = '';
        (r.htsiFactors || []).forEach((f) => {
          const li = document.createElement('li');
          const name = document.createElement('span');
          name.textContent = `${f.factor.replaceAll('_', ' ')} — ${f.value}`;
          const pts = document.createElement('span');
          pts.className = 'pts';
          pts.textContent = (f.points >= 0 ? '+' : '') + f.points;
          li.append(name, pts);
          list.appendChild(li);
        });
      }
    } else {
      $('r-htsi').textContent = '—';
      const lvl = $('r-level');
      lvl.textContent = 'unavailable';
      lvl.style.background = '';
      lvl.style.color = '';
      lvl.style.boxShadow = '';
      $('r-method').textContent = (r.notes || []).slice(-1)[0] || 'Risk cannot be calculated right now.';
      if (window.HW_3D && window.HW_3D.updateGauge) {
        window.HW_3D.updateGauge(0, 'unavailable', '#64748b');
      }
    }

    // Environment series charts
    if (Array.isArray(r.series) && r.series.length) {
      const labels = r.series.map((s) => new Date(s.timestamp).getHours() + ':00');
      window.HW_CHARTS.lineChart(
        'chart-temp',
        'Air temperature (°C)',
        labels,
        r.series.map((s) => s.airTemperatureC),
        '#00f2fe'
      );
    }
    if (r.alert) loadAlerts();
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/risk/history');
      if (!res.ok) return;
      const { history } = await res.json();
      if (!history || !history.length) return;
      const labels = history.map((h) =>
        new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
      window.HW_CHARTS.lineChart('chart-utci', 'UTCI (°C)', labels, history.map((h) => h.utci), '#f97316');
      window.HW_CHARTS.lineChart('chart-htsi', 'HTSI Score', labels, history.map((h) => h.htsi), '#c026d3');
    } catch (e) {
      /* history is optional */
    }
  }

  async function loadAlerts() {
    try {
      const res = await fetch('/api/alerts');
      if (!res.ok) return;
      const { alerts } = await res.json();
      const list = $('alerts-list');
      if (!list) return;
      list.innerHTML = '';
      if (!alerts.length) {
        list.innerHTML =
          '<li class="alert-empty">No active heat alerts. Alerts trigger when personal risk reaches HIGH or above.</li>';
        return;
      }
      alerts.forEach((a) => {
        const li = document.createElement('li');
        li.dataset.sev = a.severity;
        li.innerHTML = `<strong>${a.severity}</strong> — ${a.message}
          <span class="alert-time">${new Date(a.timestamp).toLocaleString()} · source ${a.source}</span>`;
        list.appendChild(li);
      });
    } catch (e) {
      /* non-fatal */
    }
  }

  async function assess() {
    clearError();
    if (!current) {
      showError('Set a location first — use GPS or search a place.');
      return;
    }
    $('r-level').textContent = 'assessing…';
    try {
      const res = await fetch('/api/risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: current.latitude, longitude: current.longitude }),
      });
      const body = await res.json();
      if (!res.ok) {
        showError(body.error || 'Assessment failed.');
        $('r-level').textContent = 'unavailable';
        return;
      }
      renderResult(body);
      loadHistory();
    } catch (e) {
      showError('Could not reach the HeatWatch server.');
    }
  }

  // Location search & GPS hooks
  const gpsBtn = $('use-gps');
  if (gpsBtn) {
    gpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showError('Geolocation is not available in this browser.');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          assess();
        },
        () => showError('Could not read GPS — search a place instead.')
      );
    });
  }

  const searchBtn = $('loc-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', async () => {
      const q = $('loc-search').value;
      const list = $('loc-results');
      list.innerHTML = '<li>Searching…</li>';
      const res = await fetch('/api/location/search?q=' + encodeURIComponent(q));
      const body = await res.json();
      list.innerHTML = '';
      if (!res.ok) {
        list.innerHTML = `<li>${body.error || 'Search failed.'}</li>`;
        return;
      }
      if (!body.results.length) {
        list.innerHTML = '<li>No places found.</li>';
        return;
      }
      body.results.forEach((r) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = r.displayName;
        btn.addEventListener('click', () => {
          current = r;
          list.innerHTML = '';
          assess();
        });
        li.appendChild(btn);
        list.appendChild(li);
      });
    });
  }

  const refreshBtn = $('refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', assess);

  // Initialize 3D Holographic Gauge
  if (window.HW_3D && window.HW_3D.initHoloGauge) {
    window.HW_3D.initHoloGauge('holo-gauge-container');
  }

  loadAlerts();
  loadHistory();
  if (current) assess();
})();
