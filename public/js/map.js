'use strict';

/* GIS layer: Leaflet + OpenStreetMap base map. HeatWatch computes the risk;
   Leaflet only visualizes it. */

window.HW_MAP = (function mapModule() {
  let map;
  let markerLayer;

  function init(elementId) {
    map = L.map(elementId).setView([23.3, 80.0], 5); // India view
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    return map;
  }

  function popupHtml(p) {
    const rows = [
      ['Coordinates', `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`],
      ['Temperature', p.temperature_c != null ? p.temperature_c + ' °C' : 'unavailable'],
      ['Humidity', p.relative_humidity_percent != null ? p.relative_humidity_percent + ' %' : 'unavailable'],
      ['Wind', p.wind_speed_10m_ms != null ? p.wind_speed_10m_ms + ' m/s' : 'unavailable'],
      ['Radiation', p.solar_radiation_wm2 != null ? p.solar_radiation_wm2 + ' W/m²' : 'unavailable'],
      ['Tmrt', p.tmrt_c != null ? p.tmrt_c + ' °C' : 'unavailable'],
      ['UTCI', p.utci_c != null ? `${p.utci_c} °C (${p.utci_category || '—'})` : 'unavailable'],
      ['HTSI', p.htsi_score != null ? p.htsi_score : 'unavailable'],
      ['Risk', p.risk_level || 'unavailable'],
      ['Timestamp', new Date(p.timestamp).toLocaleString()],
      ['Source', p.source === 'synthetic_demo'
        ? '<span class="src-demo">SYNTHETIC / DEMO DATA</span>'
        : p.source + (p.data_status === 'fallback' ? ' (fallback)' : '')],
    ];
    return `<div class="hw-popup"><h3>Assessment point</h3><table>${rows
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join('')}</table></div>`;
  }

  function renderPoints(points, riskColors) {
    markerLayer.clearLayers();
    points.forEach((p) => {
      const color = riskColors[p.risk_level] || '#6b7a74';
      const marker = L.circleMarker([p.latitude, p.longitude], {
        radius: 9,
        color: '#10201b',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.9,
      });
      marker.bindPopup(popupHtml(p), { maxWidth: 320 });
      markerLayer.addLayer(marker);
    });
  }

  return { init, renderPoints };
})();
