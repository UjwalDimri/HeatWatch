'use strict';

/* GIS layer: Tactical Command Dark Map + Pulsing Radar Markers.
   HeatWatch computes the thermal risk; Leaflet visualizes it. */

window.HW_MAP = (function mapModule() {
  let map;
  let markerLayer;

  function init(elementId) {
    map = L.map(elementId, {
      zoomControl: false,
    }).setView([23.3, 80.0], 5); // Center on India

    // Position zoom controls cleanly in top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // High-tech CartoDB Dark Matter base map tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
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
      ['HTSI Score', p.htsi_score != null ? p.htsi_score : 'unavailable'],
      ['Risk Level', p.risk_level || 'unavailable'],
      ['Timestamp', new Date(p.timestamp).toLocaleString()],
      ['Source', p.source === 'synthetic_demo'
        ? '<span class="src-demo">SYNTHETIC / DEMO DATA</span>'
        : p.source + (p.data_status === 'fallback' ? ' (fallback)' : '')],
    ];
    return `<div class="hw-popup">
      <h3>Tactical Telemetry Point</h3>
      <table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
    </div>`;
  }

  function renderPoints(points, riskColors) {
    markerLayer.clearLayers();
    points.forEach((p) => {
      const color = riskColors[p.risk_level] || '#00f2fe';

      // Custom pulsing radar marker using DivIcon
      const iconHtml = `
        <div class="radar-marker-wrap" style="--marker-color: ${color}">
          <div class="radar-pulse"></div>
          <div class="radar-dot" style="background-color: ${color}; box-shadow: 0 0 10px ${color}"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-radar-icon',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([p.latitude, p.longitude], { icon: customIcon });
      marker.bindPopup(popupHtml(p), { maxWidth: 340 });
      markerLayer.addLayer(marker);
    });
  }

  return { init, renderPoints };
})();
