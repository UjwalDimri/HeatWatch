'use strict';

/**
 * services/nasaPower.js — HISTORICAL / SUPPLEMENTARY environmental source.
 *
 * Endpoint: https://power.larc.nasa.gov/api/temporal/hourly/point
 * Community: RE. Parameters used (documented NASA POWER hourly parameters):
 *   T2M                 air temperature at 2 m (°C)
 *   RH2M                relative humidity at 2 m (%)
 *   WS10M               wind speed at 10 m (m/s)
 *   ALLSKY_SFC_SW_DWN   all-sky surface shortwave down (global) (W/m²)
 *   ALLSKY_SFC_SW_DIFF  all-sky surface shortwave diffuse (W/m²)
 *   ALLSKY_SFC_SW_DNI   all-sky direct normal irradiance (W/m²)
 *   ALLSKY_SFC_LW_DWN   all-sky surface longwave down (W/m²)  ← NASA POWER
 *                       actually provides measured/modelled Ldown, which lets
 *                       the historical pipeline compute Tmrt without the
 *                       long-wave approximation used for live data.
 *
 * This service is used for the HISTORICAL/TRAINING pipeline and for
 * validation. It is NOT called on every live user request. NASA POWER does
 * not provide UTCI — UTCI is always computed by calculations/utci.js from
 * the normalized variables.
 */

const { makeCanonicalRecord } = require('./canonical');

const BASE = 'https://power.larc.nasa.gov/api/temporal/hourly/point';
const PARAMS = 'T2M,RH2M,WS10M,ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DIFF,ALLSKY_SFC_SW_DNI,ALLSKY_SFC_LW_DWN';

let lastStatus = { state: 'unknown', checkedAt: null, detail: null };
function getStatus() {
  return { ...lastStatus };
}

const FILL = -999; // NASA POWER fill value for missing data

function clean(v) {
  return v === undefined || v === null || Number(v) <= FILL + 1 ? null : Number(v);
}

/**
 * Fetch hourly historical data for a date range and normalize every hour
 * into the canonical schema.
 * @param {number} latitude
 * @param {number} longitude
 * @param {string} startYyyymmdd e.g. "20240501"
 * @param {string} endYyyymmdd   e.g. "20240531"
 * @returns {Promise<Array<object>>} canonical records (source = "nasa_power")
 */
async function fetchHistoricalHourly(latitude, longitude, startYyyymmdd, endYyyymmdd) {
  const url =
    `${BASE}?parameters=${PARAMS}&community=RE&latitude=${encodeURIComponent(latitude)}` +
    `&longitude=${encodeURIComponent(longitude)}&start=${startYyyymmdd}&end=${endYyyymmdd}` +
    `&format=JSON&time-standard=UTC`;

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  } catch (err) {
    lastStatus = { state: 'unavailable', checkedAt: new Date().toISOString(), detail: err.message };
    const e = new Error(`NASA POWER request failed: ${err.message}`);
    e.code = 'SOURCE_UNAVAILABLE';
    throw e;
  }
  if (!res.ok) {
    lastStatus = { state: 'error', checkedAt: new Date().toISOString(), detail: `HTTP ${res.status}` };
    const e = new Error(`NASA POWER returned HTTP ${res.status}`);
    e.code = 'SOURCE_ERROR';
    throw e;
  }
  const body = await res.json();
  const p = body?.properties?.parameter;
  if (!p || !p.T2M) {
    lastStatus = { state: 'error', checkedAt: new Date().toISOString(), detail: 'unexpected payload' };
    const e = new Error('NASA POWER response missing expected parameters.');
    e.code = 'SOURCE_ERROR';
    throw e;
  }
  lastStatus = { state: 'operational', checkedAt: new Date().toISOString(), detail: null };

  const records = [];
  for (const key of Object.keys(p.T2M)) {
    // key format: YYYYMMDDHH
    const ts = new Date(
      Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8), +key.slice(8, 10))
    );
    records.push(
      makeCanonicalRecord({
        timestamp: ts,
        latitude,
        longitude,
        source: 'nasa_power',
        airTemperatureC: clean(p.T2M[key]),
        relativeHumidityPercent: clean(p.RH2M?.[key]),
        windSpeed10mMs: clean(p.WS10M?.[key]),
        shortwaveRadiationWm2: clean(p.ALLSKY_SFC_SW_DWN?.[key]),
        diffuseRadiationWm2: clean(p.ALLSKY_SFC_SW_DIFF?.[key]),
        directNormalIrradianceWm2: clean(p.ALLSKY_SFC_SW_DNI?.[key]),
        longwaveDownWm2: clean(p.ALLSKY_SFC_LW_DWN?.[key]),
      })
    );
  }
  return records;
}

async function probe() {
  try {
    const res = await fetch(
      `${BASE}?parameters=T2M&community=RE&latitude=0&longitude=0&start=20240101&end=20240101&format=JSON`,
      { signal: AbortSignal.timeout(8000) }
    );
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

module.exports = { fetchHistoricalHourly, probe, getStatus };
