'use strict';

/**
 * services/nominatim.js — OPTIONAL location search / geocoding only.
 *
 * Nominatim (OpenStreetMap) converts a place name → latitude/longitude.
 * It is never used as a weather API. When the browser already supplies GPS
 * coordinates, Nominatim is not called at all.
 *
 * Usage policy: identify the application via User-Agent and keep request
 * volume low (results are cached in-process for 10 minutes).
 */

const BASE = 'https://nominatim.openstreetmap.org/search';
const cache = new Map();
const TTL_MS = 10 * 60 * 1000;

let lastStatus = { state: 'unknown', checkedAt: null, detail: null };
function getStatus() {
  return { ...lastStatus };
}

async function searchLocation(query) {
  const q = String(query || '').trim();
  if (q.length < 2) {
    const e = new Error('Location query must be at least 2 characters.');
    e.code = 'BAD_INPUT';
    throw e;
  }
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.results;

  const url = `${BASE}?q=${encodeURIComponent(q)}&format=jsonv2&limit=5&addressdetails=0`;
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': process.env.NOMINATIM_USER_AGENT || 'HeatWatch-Prototype/1.0' },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    lastStatus = { state: 'unavailable', checkedAt: new Date().toISOString(), detail: err.message };
    const e = new Error(`Nominatim request failed: ${err.message}`);
    e.code = 'SOURCE_UNAVAILABLE';
    throw e;
  }
  if (!res.ok) {
    lastStatus = { state: 'error', checkedAt: new Date().toISOString(), detail: `HTTP ${res.status}` };
    const e = new Error(`Nominatim returned HTTP ${res.status}`);
    e.code = 'SOURCE_ERROR';
    throw e;
  }
  const body = await res.json();
  lastStatus = { state: 'operational', checkedAt: new Date().toISOString(), detail: null };

  const results = (Array.isArray(body) ? body : []).map((r) => ({
    displayName: r.display_name,
    latitude: Number(r.lat),
    longitude: Number(r.lon),
    type: r.type,
  }));
  cache.set(key, { at: Date.now(), results });
  return results;
}

async function probe() {
  try {
    const res = await fetch(`${BASE}?q=Delhi&format=jsonv2&limit=1`, {
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

module.exports = { searchLocation, probe, getStatus };
