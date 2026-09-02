'use strict';

/**
 * services/thermalPipeline.js
 *
 * The SINGLE scientific pipeline that turns a canonical environmental
 * record into vapour pressure → Tmrt → ΔTmrt → UTCI → UTCI category.
 *
 * This exact function is used by BOTH:
 *   - the historical/training-data pipeline (scripts/buildTrainingData.js)
 *   - the live prediction pipeline (services/riskPipeline.js)
 * so there is exactly one implementation of every formula (no
 * training/production divergence).
 */

const { calculateVapourPressure } = require('../calculations/vapourPressure');
const { calculateTmrt } = require('../calculations/tmrt');
const { calculateUtci } = require('../calculations/utci');
const { classifyUtci } = require('../calculations/utciCategory');
const { validateCanonicalRecord } = require('./canonical');

/**
 * Mutates a copy of the canonical record with derived thermal values and
 * status fields, never inventing missing inputs.
 * @param {object} canonicalRecord
 * @returns {object} enriched record
 */
function runThermalPipeline(canonicalRecord) {
  const rec = { ...canonicalRecord };
  const notes = [];

  const validation = validateCanonicalRecord(rec);
  if (!validation.ok) {
    rec.dataStatus = rec.dataStatus === 'fallback' ? 'fallback' : rec.dataStatus;
    notes.push(`Missing source variables: ${validation.missing.join(', ')}.`);
  }

  // 1. Vapour pressure -----------------------------------------------------
  const vp = calculateVapourPressure({
    airTemperatureC: rec.airTemperatureC,
    relativeHumidityPercent: rec.relativeHumidityPercent,
  });
  rec.vapourPressureKpa = vp.vapourPressureKpa;
  if (vp.status !== 'calculated') notes.push(`Vapour pressure: ${vp.reason}`);

  // 2. Tmrt ----------------------------------------------------------------
  const tm = calculateTmrt({
    airTemperatureC: rec.airTemperatureC,
    vapourPressureKpa: rec.vapourPressureKpa,
    shortwaveRadiationWm2: rec.shortwaveRadiationWm2,
    diffuseRadiationWm2: rec.diffuseRadiationWm2,
    directRadiationWm2: rec.directRadiationWm2,
    directNormalIrradianceWm2: rec.directNormalIrradianceWm2,
    longwaveDownWm2: rec.longwaveDownWm2,
    longwaveUpWm2: rec.longwaveUpWm2,
    cloudCoverPercent: rec.cloudCoverPercent,
    latitude: rec.latitude,
    longitude: rec.longitude,
    timestamp: rec.timestamp,
  });
  rec.tmrtC = tm.tmrtC;
  rec.tmrtStatus = tm.status;
  if (tm.note) notes.push(tm.note);
  if (tm.status === 'unavailable') notes.push(`Tmrt: ${tm.reason}`);

  // 3. ΔTmrt ---------------------------------------------------------------
  rec.deltaTmrtC =
    rec.tmrtC !== null && rec.airTemperatureC !== null
      ? Math.round((rec.tmrtC - rec.airTemperatureC) * 10) / 10
      : null;

  // 4. UTCI ----------------------------------------------------------------
  if (rec.tmrtC === null || rec.vapourPressureKpa === null) {
    rec.utciC = null;
    rec.utciStatus = 'unavailable';
    notes.push(
      rec.tmrtC === null
        ? 'Required environmental radiation data is unavailable, therefore UTCI cannot currently be calculated.'
        : 'Vapour pressure unavailable, therefore UTCI cannot currently be calculated.'
    );
  } else {
    const u = calculateUtci({
      airTemperatureC: rec.airTemperatureC,
      tmrtC: rec.tmrtC,
      windSpeed10mMs: rec.windSpeed10mMs,
      vapourPressureKpa: rec.vapourPressureKpa,
    });
    rec.utciC = u.utciC;
    rec.utciStatus = u.status;
    if (u.status !== 'calculated') notes.push(`UTCI: ${u.reason}`);
  }

  // 5. UTCI category (kept separate from the numeric value) ----------------
  rec.utciCategory = classifyUtci(rec.utciC);

  rec.pipelineNotes = notes;
  return rec;
}

module.exports = { runThermalPipeline };
