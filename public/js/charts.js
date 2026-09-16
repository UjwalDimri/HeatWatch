/* Shared Chart.js helpers with Cyber Dark & Glowing Neon Theme */
'use strict';

window.HW_CHARTS = (function chartsModule() {
  const registry = {};

  function hexToRgba(hex, alpha = 1) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }

  function lineChart(canvasId, label, labels, data, color) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    if (registry[canvasId]) registry[canvasId].destroy();

    const chartContext = ctx.getContext('2d');
    const gradient = chartContext.createLinearGradient(0, 0, 0, 140);
    gradient.addColorStop(0, hexToRgba(color || '#00f2fe', 0.28));
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    registry[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label,
            data,
            borderColor: color || '#00f2fe',
            borderWidth: 2.2,
            backgroundColor: gradient,
            fill: true,
            pointBackgroundColor: color || '#00f2fe',
            pointBorderColor: '#060913',
            pointBorderWidth: 1.5,
            pointRadius: 3.5,
            pointHoverRadius: 6,
            tension: 0.35,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            display: true,
            labels: {
              color: '#94a3b8',
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: 600 },
              boxWidth: 12,
              boxHeight: 12,
            },
          },
          tooltip: {
            backgroundColor: 'rgba(13, 22, 41, 0.95)',
            titleColor: '#00f2fe',
            bodyColor: '#fff',
            borderColor: 'rgba(56, 189, 248, 0.3)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            titleFont: { family: "'JetBrains Mono', monospace" },
            bodyFont: { family: "'JetBrains Mono', monospace" },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(148, 163, 184, 0.08)' },
            ticks: {
              color: '#64748b',
              font: { family: "'JetBrains Mono', monospace", size: 10 },
              maxTicksLimit: 8,
            },
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.08)' },
            ticks: {
              color: '#64748b',
              font: { family: "'JetBrains Mono', monospace", size: 10 },
            },
          },
        },
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
      data: {
        labels,
        datasets: [
          {
            label,
            data,
            backgroundColor: colors,
            borderRadius: 6,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(13, 22, 41, 0.95)',
            titleColor: '#38bdf8',
            bodyColor: '#fff',
            borderColor: 'rgba(56, 189, 248, 0.3)',
            borderWidth: 1,
            cornerRadius: 8,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#94a3b8',
              font: { family: "'Outfit', sans-serif", size: 10, weight: 600 },
            },
          },
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.08)' },
            ticks: {
              color: '#64748b',
              font: { family: "'JetBrains Mono', monospace", size: 10 },
            },
          },
        },
      },
    });
  }

  return { lineChart, barChart };
})();
