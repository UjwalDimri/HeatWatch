/* Shared Chart.js helpers (Chart.js is loaded from CDN in the views). */
'use strict';

window.HW_CHARTS = (function chartsModule() {
  const registry = {};

  function lineChart(canvasId, label, labels, data, color) {
    if (typeof Chart === 'undefined') return; // Chart.js failed to load (offline)
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (registry[canvasId]) registry[canvasId].destroy();
    registry[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label, data, borderColor: color, backgroundColor: 'transparent', pointRadius: 2, tension: 0.25, spanGaps: false }],
      },
      options: {
        responsive: true,
        animation: false,
        plugins: { legend: { display: true } },
        scales: { x: { ticks: { maxTicksLimit: 8 } } },
      },
    });
  }

  function barChart(canvasId, label, labels, data, colors) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (registry[canvasId]) registry[canvasId].destroy();
    registry[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label, data, backgroundColor: colors }] },
      options: { responsive: true, animation: false, plugins: { legend: { display: false } } },
    });
  }

  return { lineChart, barChart };
})();
