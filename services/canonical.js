'use strict';

/**
 * services/canonical.js
 *
 * The single internal canonical environmental schema. Every environmental
 * source (Open-Meteo, NASA POWER, IMD, synthetic_demo) is normalized into
 * this shape before any calculation runs, so the historical/training
 * pipeline and the live pipeline consume identical structures.
 *
 * Source variables:  airTemperatureC, relativeHumidityPercent,
 *                    windSpeed10mMs, radiation components.
 * Derived variables: vapourPressureKpa, tmrtC, deltaTmrtC, utciC,
 *                    utciCategory (filled later by the pipeline).
 */

const ALLOWED_SOURCES = ['open_meteo', 'nasa_power', 'imd', 'synthetic_demo'];

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build a canonical record. Missing values stay null — never invented.
 */
function makeCanonicalRecord({
  timestamp,
  latitude,
  longitude,
  source,
  airTemperatureC = null,
  relativeHumidityPercent = null,
  windSpeed10mMs = null,
  shortwaveRadiationWm2 = null,
  directRadiationWm2 = null,
  diffuseRadiationWm2 = null,
  directNormalIrradianceWm2 = null,
  cloudCoverPercent = null,
  longwaveDownWm2 = null,
  longwaveUpWm2 = null,
}) {
  if (!ALLOWED_SOURCES.includes(source)) {
    throw new Error(`Unknown environmental source "${source}". Allowed: ${ALLOWED_SOURCES.join(', ')}`);
  }
  return {
    timestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp),
    latitude: num(latitude),
    longitude: num(longitude),
    source,
    sourceTimestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp),
    retrievedAt: new Date().toISOString(),

    airTemperatureC: num(airTemperatureC),
    relativeHumidityPercent: num(relativeHumidityPercent),
    windSpeed10mMs: num(windSpeed10mMs),

    shortwaveRadiationWm2: num(shortwaveRadiationWm2),
    directRadiationWm2: num(directRadiationWm2),
    diffuseRadiationWm2: num(diffuseRadiationWm2),
    directNormalIrradianceWm2: num(directNormalIrradianceWm2),
    cloudCoverPercent: num(cloudCoverPercent),
    longwaveDownWm2: num(longwaveDownWm2),
    longwaveUpWm2: num(longwaveUpWm2),

    // Derived — filled by the pipeline, never by a source adapter.
    vapourPressureKpa: null,
    tmrtC: null,
    deltaTmrtC: null,
    utciC: null,
    utciCategory: null,

    dataStatus: 'complete',
    tmrtStatus: null,
    utciStatus: null,
  };
}

/**
 * Validate a canonical record's SOURCE variables. Returns { ok, missing[] }.
 * Radiation completeness is judged separately by the Tmrt module.
 */
function validateCanonicalRecord(rec) {
  const missing = [];
  if (rec.airTemperatureC === null) missing.push('air temperature');
  if (rec.relativeHumidityPercent === null) missing.push('relative humidity');
  if (rec.windSpeed10mMs === null) missing.push('wind speed');
  if (rec.latitude === null || rec.longitude === null) missing.push('coordinates');
  if (!rec.timestamp) missing.push('timestamp');
  return { ok: missing.length === 0, missing };
}

function validCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
  );
}

module.exports = { makeCanonicalRecord, validateCanonicalRecord, validCoordinates, ALLOWED_SOURCES };
