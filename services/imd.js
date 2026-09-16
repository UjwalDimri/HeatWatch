'use strict';

/**
 * services/imd.js — Indian fallback source (IMD, India Meteorological Dept).
 *
 * HONESTY RULES ENFORCED HERE:
 *  - IMD data is used ONLY when the operator has configured IMD_API_BASE.
 *  - On failure this adapter reports "unavailable"/"unconfigured" and throws.
 *    It NEVER fabricates values and NEVER relabels other sources as IMD.
 *  - IMD station observations do not include solar radiation, so a successful
 *    IMD fallback yields tmrt/utci/risk = "unavailable" by design (shown
 *    honestly in the UI) while current conditions (T/RH/wind) still display.
 *
 * TWO MODES, chosen by IMD_API_BASE:
 *
 * 1) MAUSAM MODE — set IMD_API_BASE to IMD's public current-weather API:
 *      IMD_API_BASE=https://mausam.imd.gov.in/api/current_wx_api.php
 *    This is the JSON feed behind IMD's own mausam.imd.gov.in site
 *    (station observations, queried as ?id=<WMO station index>). It is
 *    real IMD data but an undocumented endpoint: it may rate-limit,
 *    change shape, or block cloud IPs. All of that is handled by failing
 *    honestly. The nearest station from the table below is used; if the
 *    nearest station is farther than MAX_STATION_KM the adapter refuses
 *    rather than pretending a distant city represents the location.
 *
 * 2) GENERIC MODE — any other URL: called as ?lat=..&lon=.. and expected to
 *    return JSON with temperature/humidity/wind fields (mapping below).
 *    Use this if you obtain an authorized IMD (or state) feed.
 */

const { makeCanonicalRecord } = require('./canonical');

let lastStatus = { state: 'unknown', checkedAt: null, detail: null };

const MAX_STATION_KM = 250;
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

/* Major IMD observatories (WMO station indices used by the mausam API). */
const STATIONS = [
  { id: '42027', name: 'Srinagar', lat: 34.08, lon: 74.83 },
  { id: '42071', name: 'Amritsar', lat: 31.63, lon: 74.87 },
  { id: '42111', name: 'Dehradun', lat: 30.32, lon: 78.03 },
  { id: '42182', name: 'New Delhi (Safdarjung)', lat: 28.58, lon: 77.20 },
  { id: '42348', name: 'Jaipur', lat: 26.82, lon: 75.80 },
  { id: '42369', name: 'Lucknow', lat: 26.75, lon: 80.88 },
  { id: '42410', name: 'Guwahati', lat: 26.10, lon: 91.58 },
  { id: '42492', name: 'Patna', lat: 25.60, lon: 85.10 },
  { id: '42647', name: 'Ahmedabad', lat: 23.07, lon: 72.63 },
  { id: '42667', name: 'Bhopal', lat: 23.28, lon: 77.35 },
  { id: '42807', name: 'Kolkata (Alipore)', lat: 22.53, lon: 88.33 },
  { id: '42867', name: 'Nagpur', lat: 21.10, lon: 79.05 },
  { id: '42971', name: 'Bhubaneswar', lat: 20.25, lon: 85.83 },
  { id: '43003', name: 'Mumbai (Santacruz)', lat: 19.12, lon: 72.85 },
  { id: '43063', name: 'Pune', lat: 18.53, lon: 73.85 },
  { id: '43128', name: 'Hyderabad', lat: 17.45, lon: 78.47 },
  { id: '43150', name: 'Visakhapatnam', lat: 17.72, lon: 83.30 },
  { id: '43279', name: 'Chennai (Meenambakkam)', lat: 13.00, lon: 80.18 },
  { id: '43295', name: 'Bengaluru', lat: 12.97, lon: 77.58 },
  { id: '43371', name: 'Thiruvananthapuram', lat: 8.48, lon: 76.95 },
];

function configured() {
  return Boolean(process.env.IMD_API_BASE);
}

function isMausam() {
  return configured() && /mausam\.imd\.gov\.in/i.test(process.env.IMD_API_BASE);
}

function getStatus() {
  if (!configured()) {
    return {
      state: 'unconfigured',
      checkedAt: new Date().toISOString(),
      detail: 'IMD_API_BASE is not set — no IMD endpoint is available to this deployment.',
    };
  }
  return { ...lastStatus };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestStation(lat, lon) {
  let best = null;
  let bestKm = Infinity;
  for (const st of STATIONS) {
    const km = haversineKm(lat, lon, st.lat, st.lon);
    if (km < bestKm) { bestKm = km; best = st; }
  }
  return { station: best, km: bestKm };
}

/* The mausam feed uses human-readable keys ("Temperature", "Humidity",
 * "Wind Speed KMPH", ...) that have drifted over time — match loosely. */
function pickField(obj, patterns) {
  for (const key of Object.keys(obj)) {
    const k = key.toLowerCase();
    if (patterns.some((p) => k.includes(p))) {
      const v = parseFloat(String(obj[key]).replace(/[^\d.+-]/g, ''));
      if (Number.isFinite(v)) return v;
    }
  }
  return null;
}

async function fetchJson(url, timeoutMs) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': process.env.NOMINATIM_USER_AGENT || 'HeatWatch-Prototype/1.0' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    lastStatus = { state: 'unavailable', checkedAt: new Date().toISOString(), detail: err.message };
    const e = new Error(`IMD request failed: ${err.message}`);
    e.code = 'SOURCE_UNAVAILABLE';
    throw e;
  }
  if (!res.ok) {
    lastStatus = { state: 'error', checkedAt: new Date().toISOString(), detail: `HTTP ${res.status}` };
    const e = new Error(`IMD endpoint returned HTTP ${res.status}`);
    e.code = 'SOURCE_ERROR';
    throw e;
  }
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch (parseErr) {
    lastStatus = { state: 'error', checkedAt: new Date().toISOString(), detail: 'non-JSON reply' };
    const e = new Error('IMD endpoint sent a non-JSON reply.');
    e.code = 'SOURCE_ERROR';
    throw e;
  }
}

async function fetchMausam(latitude, longitude) {
  const { station, km } = nearestStation(latitude, longitude);
  if (!station || km > MAX_STATION_KM) {
    const e = new Error(
      `No IMD observatory within ${MAX_STATION_KM} km of this location (nearest: ${station ? station.name : 'none'}, ${Math.round(km)} km).`
    );
    e.code = 'SOURCE_UNAVAILABLE';
    lastStatus = { state: 'unavailable', checkedAt: new Date().toISOString(), detail: e.message };
    throw e;
  }

  const cacheHit = cache.get(station.id);
  if (cacheHit && Date.now() - cacheHit.at < CACHE_TTL_MS) return cacheHit.value;

  const base = process.env.IMD_API_BASE.replace(/\/$/, '');
  const body = await fetchJson(`${base}?id=${station.id}`, 10000);
  const obs = Array.isArray(body) ? body[0] : body;
  if (!obs || typeof obs !== 'object') {
    lastStatus = { state: 'error', checkedAt: new Date().toISOString(), detail: 'empty station payload' };
    const e = new Error(`IMD returned no observation for station ${station.name}.`);
    e.code = 'SOURCE_ERROR';
    throw e;
  }

  const t = pickField(obs, ['temperature']);
  const rh = pickField(obs, ['humidity']);
  const wsKmph = pickField(obs, ['wind speed']);

  lastStatus = { state: 'operational', checkedAt: new Date().toISOString(), detail: null };

  const record = makeCanonicalRecord({
    timestamp: new Date(), // observation time formats vary; retrievedAt is exact
    latitude: station.lat,
    longitude: station.lon,
    source: 'imd',
    airTemperatureC: t,
    relativeHumidityPercent: rh,
    // mausam reports wind in km/h; convert to the canonical m/s.
    windSpeed10mMs: wsKmph !== null ? Number((wsKmph / 3.6).toFixed(2)) : null,
  });
  record.notes = [
    `IMD fallback: nearest observatory ${station.name} (~${Math.round(km)} km away).`,
    'IMD station feeds carry no solar radiation, so Tmrt/UTCI/risk are unavailable in fallback mode.',
  ];

  const value = record;
  cache.set(station.id, { at: Date.now(), value });
  return value;
}

async function fetchGeneric(latitude, longitude) {
  const base = process.env.IMD_API_BASE.replace(/\/$/, '');
  const url = `${base}?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`;
  const body = await fetchJson(url, 10000);
  lastStatus = { state: 'operational', checkedAt: new Date().toISOString(), detail: null };

  const t = body.temperature ?? body.temp ?? body.Temperature ?? null;
  const rh = body.humidity ?? body.relative_humidity ?? body.Humidity ?? null;
  const ws = body.wind_speed ?? body.windspeed ?? body.Wind_Speed ?? null;

  return makeCanonicalRecord({
    timestamp: body.observation_time ? new Date(body.observation_time) : new Date(),
    latitude,
    longitude,
    source: 'imd',
    airTemperatureC: t,
    relativeHumidityPercent: rh,
    windSpeed10mMs: ws,
  });
}

async function fetchLive(latitude, longitude) {
  if (!configured()) {
    const e = new Error('IMD endpoint is not configured (IMD_API_BASE unset).');
    e.code = 'SOURCE_UNCONFIGURED';
    throw e;
  }
  return isMausam() ? fetchMausam(latitude, longitude) : fetchGeneric(latitude, longitude);
}

async function probe() {
  if (!configured()) return getStatus();
  try {
    const url = isMausam()
      ? `${process.env.IMD_API_BASE.replace(/\/$/, '')}?id=42182` // Delhi
      : process.env.IMD_API_BASE;
    const res = await fetch(url, {
      headers: { 'User-Agent': process.env.NOMINATIM_USER_AGENT || 'HeatWatch-Prototype/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    lastStatus = {
      state: res.ok ? 'operational' : 'error',
      checkedAt: new Date().toISOString(),
      detail: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    lastStatus = { state: 'unavailable', checkedAt: new Date().toISOString(), detail: err.message };
  }
  return getStatus();
}

module.exports = { fetchLive, probe, getStatus, configured };
