'use strict';

/**
 * services/openMeteo.js — PRIMARY LIVE environmental source.
 *
 * Endpoint: https://api.open-meteo.com/v1/forecast
 * Variables requested (all supported by this endpoint's `hourly`/`current`
 * parameter sets — no unsupported variables are assumed):
 *   temperature_2m, relative_humidity_2m, wind_speed_10m, cloud_cover,
 *   shortwave_radiation, direct_radiation, diffuse_radiation,
 *   direct_normal_irradiance
 *
 * Notes:
 *  - wind_speed_10m is requested in m/s explicitly (windspeed_unit=ms).
 *  - The forecast endpoint does NOT provide long-wave radiation; the Tmrt
 *    module handles that with an explicitly labelled approximation mode.
 *  - On failure this module throws — it never fabricates weather.
 */

const { makeCanonicalRecord } = require('./canonical');

const BASE = 'https://api.open-meteo.com/v1/forecast';

const HOURLY_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'wind_speed_10m',
  'cloud_cover',
  'shortwave_radiation',
  'direct_radiation',
  'diffuse_radiation',
  'direct_normal_irradiance',
];

let lastStatus = { state: 'unknown', checkedAt: null, detail: null };

/* Short-lived cache: repeated assessments at (almost) the same place within
 * CACHE_TTL_MS reuse the last successful response instead of re-calling the
 * API. This protects demos from Open-Meteo HTTP 429 rate limits (shared
 * hosting IPs). Cached responses are real, recent measurements — the record
 * keeps its original retrievedAt, so freshness stays visible and honest. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // key -> { at, value }

function cacheKey(lat, lon) {
  return `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`; // ~1 km buckets
}

function getStatus() {
  return { ...lastStatus };
}

/**
 * Fetch current + short-term hourly data and normalize the hour closest to
 * "now" into the canonical schema. Also returns the recent hourly series
 * for charts.
 */
async function fetchLive(latitude, longitude) {
  const key = cacheKey(latitude, longitude);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const url =
    `${BASE}?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}` +
    `&hourly=${HOURLY_VARS.join(',')}` +
    `&windspeed_unit=ms&timezone=UTC&past_days=1&forecast_days=1`;

  // HTTP 429 (rate limit) is per-minute and often affects shared hosting IPs;
  // a short backoff-and-retry usually clears it without bothering the user.
  let res;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch (err) {
      lastStatus = { state: 'unavailable', checkedAt: new Date().toISOString(), detail: err.message };
      const e = new Error(`Open-Meteo request failed: ${err.message}`);
      e.code = 'SOURCE_UNAVAILABLE';
      throw e;
    }
    if (res.status !== 429) break;
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 4000));
  }
  if (!res.ok) {
    lastStatus = { state: 'error', checkedAt: new Date().toISOString(), detail: `HTTP ${res.status}` };
    const e = new Error(res.status === 429
      ? 'Open-Meteo is rate limiting this server (HTTP 429, retried 3x) — try again in a minute.'
      : `Open-Meteo returned HTTP ${res.status}`);
    e.code = 'SOURCE_ERROR';
    throw e;
  }

  // Rate limiters occasionally answer 200 with plain text instead of JSON —
  // read as text first so a non-JSON reply produces a clear, honest error.
  const raw = await res.text();
  let body;
  try {
    body = JSON.parse(raw);
  } catch (parseErr) {
    lastStatus = { state: 'error', checkedAt: new Date().toISOString(), detail: 'non-JSON reply (likely rate limiting)' };
    const e = new Error('Open-Meteo sent a non-JSON reply — usually temporary rate limiting; try again in a few minutes.');
    e.code = 'SOURCE_ERROR';
    throw e;
  }
  const h = body.hourly;
  if (!h || !Array.isArray(h.time) || h.time.length === 0) {
    lastStatus = { state: 'error', checkedAt: new Date().toISOString(), detail: 'empty hourly payload' };
    const e = new Error('Open-Meteo response contained no hourly data.');
    e.code = 'SOURCE_ERROR';
    throw e;
  }

  lastStatus = { state: 'operational', checkedAt: new Date().toISOString(), detail: null };

  // Pick the hour closest to now (times are UTC, format "YYYY-MM-DDTHH:00").
  const now = Date.now();
  let idx = 0;
  let best = Infinity;
  h.time.forEach((t, i) => {
    const d = Math.abs(new Date(`${t}:00Z`.replace(/:00:00Z$/, ':00Z')).getTime() - now);
    if (d < best) {
      best = d;
      idx = i;
    }
  });

  const at = (arr, i) => (Array.isArray(arr) && arr[i] !== undefined ? arr[i] : null);

  const record = makeCanonicalRecord({
    timestamp: new Date(`${h.time[idx]}:00Z`.replace(/:00:00Z$/, ':00Z')),
    latitude: body.latitude,
    longitude: body.longitude,
    source: 'open_meteo',
    airTemperatureC: at(h.temperature_2m, idx),
    relativeHumidityPercent: at(h.relative_humidity_2m, idx),
    windSpeed10mMs: at(h.wind_speed_10m, idx),
    cloudCoverPercent: at(h.cloud_cover, idx),
    shortwaveRadiationWm2: at(h.shortwave_radiation, idx),
    directRadiationWm2: at(h.direct_radiation, idx),
    diffuseRadiationWm2: at(h.diffuse_radiation, idx),
    directNormalIrradianceWm2: at(h.direct_normal_irradiance, idx),
  });

  // Recent series (last 24 entries up to the selected hour) for charts.
  const start = Math.max(0, idx - 23);
  const series = [];
  for (let i = start; i <= idx; i += 1) {
    series.push({
      timestamp: `${h.time[i]}:00Z`.replace(/:00:00Z$/, ':00Z'),
      airTemperatureC: at(h.temperature_2m, i),
      relativeHumidityPercent: at(h.relative_humidity_2m, i),
      windSpeed10mMs: at(h.wind_speed_10m, i),
      cloudCoverPercent: at(h.cloud_cover, i),
      shortwaveRadiationWm2: at(h.shortwave_radiation, i),
      directRadiationWm2: at(h.direct_radiation, i),
      diffuseRadiationWm2: at(h.diffuse_radiation, i),
      directNormalIrradianceWm2: at(h.direct_normal_irradiance, i),
    });
  }

  const value = { record, series };
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Lightweight connectivity probe for the admin API-status panel. */
async function probe() {
  try {
    const res = await fetch(`${BASE}?latitude=0&longitude=0&hourly=temperature_2m&forecast_days=1`, {
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

module.exports = { fetchLive, probe, getStatus, HOURLY_VARS };
