'use strict';

(function government() {
  const colors = window.HEATWATCH_RISK_COLORS || {};
  const errEl = document.getElementById('gov-error');
  window.HW_MAP.init('map');

  // legend
  const legend = document.getElementById('legend-list');
  Object.entries(colors).forEach(([level, color]) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="swatch" style="background:${color}"></span>${level}`;
    legend.appendChild(li);
  });

  async function load() {
    errEl.hidden = true;
    try {
      const [ptsRes, statsRes] = await Promise.all([
        fetch('/api/map/risk-points'),
        fetch('/api/government/statistics'),
      ]);
      if (!ptsRes.ok || !statsRes.ok) {
        const b = !ptsRes.ok ? await ptsRes.json() : await statsRes.json();
        throw new Error(b.error || 'Could not load map data.');
      }
      const { points } = await ptsRes.json();
      const stats = await statsRes.json();

      window.HW_MAP.renderPoints(points, colors);

      document.getElementById('g-total').textContent = stats.totalMonitoredLocations;
      document.getElementById('g-high').textContent = stats.highRiskLocations;
      document.getElementById('g-vhigh').textContent = stats.veryHighRiskLocations;
      document.getElementById('g-extreme').textContent = stats.extremeRiskLocations;
      document.getElementById('g-utci').textContent = stats.utci
        ? `${stats.utci.min} – ${stats.utci.max} °C (mean ${stats.utci.mean})`
        : 'unavailable';

      const labels = Object.keys(stats.riskDistribution);
      window.HW_CHARTS.barChart(
        'chart-dist',
        'Locations',
        labels,
        labels.map((l) => stats.riskDistribution[l]),
        labels.map((l) => colors[l] || '#888')
      );

      if (!points.length) {
        errEl.textContent =
          'No stored assessment points in the last 48 h. Run citizen assessments, or seed clearly-labelled demo points with: node scripts/seedDemoMap.js';
        errEl.hidden = false;
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  }

  load();
  setInterval(load, 5 * 60 * 1000);
})();
