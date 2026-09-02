'use strict';

(function dashboard() {
  const $ = (id) => document.getElementById(id);
  const errEl = $('dash-error');
  let current = window.HEATWATCH_PROFILE_LOCATION; // {latitude, longitude} or null

  function showError(msg) { errEl.textContent = msg; errEl.hidden = false; }
  function clearError() { errEl.hidden = true; }
  function fmt(v, unit, digits = 1) {
    return v === null || v === undefined ? 'unavailable' : `${Number(v).toFixed(digits)} ${unit}`;
  }
  function setChip(id, state) {
    const el = $(id);
    el.textContent = state || '—';
    el.dataset.state = state || '';
  }

  function renderResult(r) {
    $('loc-label').textContent = `${r.latitude.toFixed(3)}, ${r.longitude.toFixed(3)}`;
    $('w-temp').textContent = fmt(r.temperature, '°C');
    $('w-rh').textContent = fmt(r.relativeHumidity, '%', 0);
    $('w-wind').textContent = fmt(r.windSpeed, 'm/s');
    $('w-rad').textContent = fmt(r.radiation, 'W/m²', 0);
    $('w-vp').textContent = fmt(r.vapourPressure, 'kPa', 2);
    $('w-tmrt').textContent = fmt(r.tmrt, '°C');
    $('w-utci').textContent = fmt(r.utci, '°C');
    $('w-utci-cat').textContent = r.utciCategory || 'unavailable';
    $('w-source').textContent = r.source + (r.fallbackUsed ? ' (fallback)' : '');
    $('w-updated').textContent = new Date(r.timestamp).toLocaleString();
    setChip('w-status', r.dataStatus);
    setChip('w-tmrt-status', r.tmrtStatus);
    setChip('w-utci-status', r.utciStatus);
    const notes = (r.notes || []).join(' ');
    $('w-notes').textContent = notes;
    $('w-notes').hidden = !notes;

    // Risk panel
    const colors = window.HEATWATCH_RISK_COLORS || {};
    if (r.htsi !== null && r.htsi !== undefined) {
      $('r-htsi').textContent = r.htsi.toFixed(1);
      const lvl = $('r-level');
      lvl.textContent = r.riskLevel;
      lvl.style.background = colors[r.riskLevel] || 'var(--ground)';
      lvl.style.color = '#fff';
      $('r-method').textContent =
        r.htsiMethod === 'random_forest'
          ? `Random Forest model v${r.modelInfo && r.modelInfo.modelVersion ? r.modelInfo.modelVersion : '?'} (labels: synthetic rules — prototype)`
          : 'Transparent rule engine (prototype)';
      $('r-marker').style.left = `${Math.min(100, Math.max(0, r.htsi))}%`;
      const list = $('r-factors');
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
    } else {
      $('r-htsi').textContent = '—';
      $('r-level').textContent = 'unavailable';
      $('r-level').style.background = '';
      $('r-level').style.color = '';
      $('r-method').textContent = (r.notes || []).slice(-1)[0] || 'Risk cannot be calculated right now.';
    }

    // Environment series charts (temperature from source series)
    if (Array.isArray(r.series) && r.series.length) {
      const labels = r.series.map((s) => new Date(s.timestamp).getHours() + ':00');
      window.HW_CHARTS.lineChart('chart-temp', 'Air temperature (°C)', labels,
        r.series.map((s) => s.airTemperatureC), '#0e5a52');
    }
    if (r.alert) loadAlerts();
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/risk/history');
      if (!res.ok) return;
      const { history } = await res.json();
      if (!history.length) return;
      const labels = history.map((h) => new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      window.HW_CHARTS.lineChart('chart-utci', 'UTCI (°C)', labels, history.map((h) => h.utci), '#cf3f2e');
      window.HW_CHARTS.lineChart('chart-htsi', 'HTSI', labels, history.map((h) => h.htsi), '#7a1f6b');
    } catch (e) { /* history is optional */ }
  }

  async function loadAlerts() {
    try {
      const res = await fetch('/api/alerts');
      if (!res.ok) return;
      const { alerts } = await res.json();
      const list = $('alerts-list');
      list.innerHTML = '';
      if (!alerts.length) {
        list.innerHTML = '<li class="alert-empty">No alerts yet. Alerts appear when your personalized risk reaches HIGH.</li>';
        return;
      }
      alerts.forEach((a) => {
        const li = document.createElement('li');
        li.dataset.sev = a.severity;
        li.innerHTML = `<strong>${a.severity}</strong> — ${a.message}
          <span class="alert-time">${new Date(a.timestamp).toLocaleString()} · source ${a.source}</span>`;
        list.appendChild(li);
      });
    } catch (e) { /* non-fatal */ }
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

  $('use-gps').addEventListener('click', () => {
    if (!navigator.geolocation) { showError('Geolocation is not available in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }; assess(); },
      () => showError('Could not read GPS — search a place instead.')
    );
  });

  $('loc-search-btn').addEventListener('click', async () => {
    const q = $('loc-search').value;
    const list = $('loc-results');
    list.innerHTML = '<li>Searching…</li>';
    const res = await fetch('/api/location/search?q=' + encodeURIComponent(q));
    const body = await res.json();
    list.innerHTML = '';
    if (!res.ok) { list.innerHTML = `<li>${body.error || 'Search failed.'}</li>`; return; }
    if (!body.results.length) { list.innerHTML = '<li>No places found.</li>'; return; }
    body.results.forEach((r) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = r.displayName;
      btn.addEventListener('click', () => { current = r; list.innerHTML = ''; assess(); });
      li.appendChild(btn);
      list.appendChild(li);
    });
  });

  $('refresh-btn').addEventListener('click', assess);

  loadAlerts();
  loadHistory();
  if (current) assess();
})();
