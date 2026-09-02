'use strict';

/**
 * services/imd.js — Indian fallback source (IMD, India Meteorological Dept).
 *
 * HONESTY RULES ENFORCED HERE:
 *  - IMD data is used ONLY through an endpoint the operator has actually
 *    configured via IMD_API_BASE (+ optional IMD_API_KEY) in .env.
 *  - If no endpoint is configured or the endpoint fails, this adapter
 *    reports imd_status = "unavailable" / "unconfigured". It NEVER
 *    fabricates values and NEVER relabels Open-Meteo or NASA POWER data
 *    as IMD data.
 *
 * The adapter expects the configured endpoint to return JSON containing at
 * least temperature (°C), relative humidity (%) and wind speed. Field names
 * can be mapped below for the specific endpoint the operator has access to.
 * IMD public APIs generally do not provide solar-radiation components, so a
 * successful IMD fallback typically yields tmrtStatus/utciStatus =
 * "unavailable" (rather than an invented radiation value) unless radiation
 * is present in the configured feed.
 */

const { makeCanonicalRecord } = require('./canonical');

let lastStatus = { state: 'unknown', checkedAt: null, detail: null };

function configured() {
  return Boolean(process.env.IMD_API_BASE);
}

function getStatus() {
  if (!configured()) {
    return {
      state: 'unconfigured',
      checkedAt: new Date().toISOString(),
      detail: 'IMD_API_BASE is not set — no authorized IMD endpoint is available to this deployment.',
    };
  }
  return { ...lastStatus };
}

/**
 * Attempt an IMD fetch for the given coordinates.
 * @returns canonical record with source "imd", or throws with code
 *          SOURCE_UNCONFIGURED / SOURCE_UNAVAILABLE / SOURCE_ERROR.
 */
async function fetchLive(latitude, longitude) {
  if (!configured()) {
    const e = new Error('IMD endpoint is not configured (IMD_API_BASE unset).');
    e.code = 'SOURCE_UNCONFIGURED';
    throw e;
  }
  const base = process.env.IMD_API_BASE.replace(/\/$/, '');
  const url = `${base}?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`;
  const headers = {};
  if (process.env.IMD_API_KEY) headers['x-api-key'] = process.env.IMD_API_KEY;

  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
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
  const body = await res.json();
  lastStatus = { state: 'operational', checkedAt: new Date().toISOString(), detail: null };

  // Field mapping for the configured endpoint. Adjust to the feed you are
  // authorized to use. Missing fields stay null — never invented.
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

async function probe() {
  if (!configured()) return getStatus();
  try {
    const res = await fetch(process.env.IMD_API_BASE, { signal: AbortSignal.timeout(6000) });
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
