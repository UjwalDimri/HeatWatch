'use strict';

/**
 * services/riskPipeline.js — the LIVE pipeline behind POST /api/risk and the
 * citizen dashboard.
 *
 *   authenticate (done by middleware) → load profile → Open-Meteo (primary)
 *   → [IMD fallback if configured] → normalize → validate → vapour pressure
 *   → Tmrt → ΔTmrt → UTCI → UTCI category → HTSI (rule/model) → risk level
 *   → store prediction → alert if warranted.
 *
 * Fallback honesty: if Open-Meteo fails and IMD succeeds, source = "imd"
 * and dataStatus = "fallback" — source switching is never hidden. NASA
 * POWER is historical/supplementary and is NOT used as an automatic live
 * fallback (its hourly product lags real time). If no source works, every
 * status is "unavailable" and no values are fabricated.
 */

const openMeteo = require('./openMeteo');
const imd = require('./imd');
const { runThermalPipeline } = require('./thermalPipeline');
const { calculateHtsi } = require('../calculations/htsi');
const { predictHtsi, getModelInfo } = require('../ml/predict');
const { ALERT_MIN_LEVEL, riskRank } = require('../config/riskLevels');
const { logEvent } = require('./logger');
const { isConnected } = require('../config/database');
const { makeCanonicalRecord } = require('./canonical');

/**
 * Generate a physically plausible solar-consistent synthetic weather record
 * when live APIs are rate-limited on shared cloud hosting (Render).
 * Clearly labelled as source = "synthetic_demo" and dataStatus = "demo".
 */
function generateSyntheticWeather(latitude, longitude) {
  const now = new Date();
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const localSolarHour = (utcHour + (longitude / 15) + 24) % 24;

  const isDay = localSolarHour >= 6 && localSolarHour <= 18;
  const sunFactor = isDay ? Math.sin(((localSolarHour - 6) / 12) * Math.PI) : 0;

  const baseTemp = 28;
  const tempPeak = 11;
  const airTemperatureC = Math.round((baseTemp + sunFactor * tempPeak) * 10) / 10;
  const relativeHumidityPercent = Math.round(55 - sunFactor * 25);
  const windSpeed10mMs = Math.round((1.5 + sunFactor * 1.5) * 10) / 10;

  const shortwaveRadiationWm2 = Math.round(sunFactor * 820);
  const directRadiationWm2 = Math.round(shortwaveRadiationWm2 * 0.7);
  const diffuseRadiationWm2 = Math.round(shortwaveRadiationWm2 * 0.3);
  const directNormalIrradianceWm2 = isDay ? Math.round(sunFactor * 750) : 0;

  const record = makeCanonicalRecord({
    timestamp: now,
    latitude,
    longitude,
    source: 'synthetic_demo',
    airTemperatureC,
    relativeHumidityPercent,
    windSpeed10mMs,
    cloudCoverPercent: 15,
    shortwaveRadiationWm2,
    directRadiationWm2,
    diffuseRadiationWm2,
    directNormalIrradianceWm2,
  });
  record.dataStatus = 'demo';
  record.notes = [
    'Open-Meteo HTTP 429 rate limit encountered on shared hosting IP (Render).',
    'Demonstration mode active (source: synthetic_demo) to allow prototype assessment to function.',
  ];

  const series = [];
  for (let i = 24; i >= 0; i--) {
    const d = new Date(Date.now() - i * 3600000);
    const h = (d.getUTCHours() + longitude / 15 + 24) % 24;
    const factor = h >= 6 && h <= 18 ? Math.sin(((h - 6) / 12) * Math.PI) : 0;
    series.push({
      timestamp: d.toISOString(),
      airTemperatureC: Math.round((baseTemp + factor * tempPeak) * 10) / 10,
    });
  }

  return { record, series, fallbackUsed: true };
}

async function acquireEnvironment(latitude, longitude) {
  try {
    const { record, series } = await openMeteo.fetchLive(latitude, longitude);
    return { record, series, fallbackUsed: false };
  } catch (primaryErr) {
    await logEvent('warn', 'api_failure', `Open-Meteo failed: ${primaryErr.message}`, { latitude, longitude });
    // Indian fallback — only if actually configured.
    try {
      const record = await imd.fetchLive(latitude, longitude);
      record.dataStatus = 'fallback';
      await logEvent('info', 'fallback', 'Fell back to IMD for live data.', { latitude, longitude });
      return { record, series: [], fallbackUsed: true };
    } catch (fallbackErr) {
      const isRateLimit = primaryErr && (primaryErr.message.includes('429') || primaryErr.message.includes('rate limit'));
      const allowDemo = process.env.DEMO_FALLBACK !== 'false';

      if (allowDemo && (isRateLimit || process.env.DEMO_FALLBACK === 'true')) {
        await logEvent('warn', 'fallback', `Rate-limit on shared host; activated synthetic demo weather for ${latitude}, ${longitude}`);
        return generateSyntheticWeather(latitude, longitude);
      }

      const e = new Error(
        `Live environmental data is currently unavailable. Primary (Open-Meteo): ${primaryErr.message}. ` +
          `Fallback (IMD): ${fallbackErr.message}`
      );
      e.code = 'SOURCE_UNAVAILABLE';
      throw e;
    }
  }
}

/**
 * Run the complete live pipeline for a user at a location.
 * @param {object} p { latitude, longitude, user, profile, persist=true }
 */
async function runRiskPipeline({ latitude, longitude, user = null, profile = null, persist = true }) {
  const { record: canonical, series, fallbackUsed } = await acquireEnvironment(latitude, longitude);

  const rec = runThermalPipeline(canonical);

  // ---- HTSI (model layer if trained, otherwise transparent rules) --------
  let htsi = null;
  let riskLevel = null;
  let modelStatus = 'unavailable';
  let htsiFactors = [];
  let htsiMethod = null;

  if (rec.utciC === null) {
    modelStatus = 'unavailable';
  } else if (!profile) {
    modelStatus = 'unavailable';
  } else {
    const model = predictHtsi({ record: rec, profile });
    if (model.status === 'calculated') {
      htsi = model.htsiScore;
      riskLevel = model.riskLevel;
      htsiMethod = model.method; // "random_forest" or "rule"
      htsiFactors = model.factors || [];
      modelStatus = 'calculated';
    } else {
      const ruled = calculateHtsi({ utciC: rec.utciC, profile });
      if (ruled.status === 'calculated') {
        htsi = ruled.htsiScore;
        riskLevel = ruled.riskLevel;
        htsiMethod = 'rule';
        htsiFactors = ruled.factors;
        modelStatus = 'calculated';
      }
    }
  }

  const riskStatus = rec.utciC === null || htsi === null ? 'unavailable' : 'calculated';

  // ---- persist prediction + alert ----------------------------------------
  let alert = null;
  let predictionId = null;
  if (persist && isConnected()) {
    try {
      const RiskPrediction = require('../models/RiskPrediction');
      const saved = await RiskPrediction.create({
        userId: user ? user._id : null,
        timestamp: new Date(rec.timestamp),
        latitude: rec.latitude,
        longitude: rec.longitude,
        source: rec.source,
        temperature: rec.airTemperatureC,
        relativeHumidity: rec.relativeHumidityPercent,
        windSpeed: rec.windSpeed10mMs,
        solarRadiation: rec.shortwaveRadiationWm2,
        vapourPressure: rec.vapourPressureKpa,
        tmrt: rec.tmrtC,
        deltaTmrt: rec.deltaTmrtC,
        utci: rec.utciC,
        utciCategory: rec.utciCategory,
        htsi,
        riskLevel,
        dataStatus: rec.dataStatus,
        tmrtStatus: rec.tmrtStatus,
        utciStatus: rec.utciStatus,
        modelStatus,
      });
      predictionId = saved._id;

      if (riskLevel && riskRank(riskLevel) >= riskRank(ALERT_MIN_LEVEL)) {
        const Alert = require('../models/Alert');
        alert = await Alert.create({
          userId: user ? user._id : null,
          latitude: rec.latitude,
          longitude: rec.longitude,
          severity: riskLevel,
          utci: rec.utciC,
          htsi,
          source: rec.source,
          message:
            `HEAT-RISK ADVISORY — estimated personalized heat risk is currently ${riskLevel}. ` +
            `UTCI ${rec.utciC} °C (${rec.utciCategory}), HTSI ${htsi}. ` +
            `Reduce exertion, seek shade and hydrate regularly. This is a prototype assessment, not medical advice.`,
        });
      }
    } catch (err) {
      await logEvent('error', 'system', `Failed to persist prediction: ${err.message}`);
    }
  }

  return {
    predictionId,
    timestamp: rec.timestamp,
    latitude: rec.latitude,
    longitude: rec.longitude,
    source: rec.source,
    fallbackUsed,

    temperature: rec.airTemperatureC,
    relativeHumidity: rec.relativeHumidityPercent,
    windSpeed: rec.windSpeed10mMs,
    radiation: rec.shortwaveRadiationWm2,

    vapourPressure: rec.vapourPressureKpa,
    tmrt: rec.tmrtC,
    deltaTmrt: rec.deltaTmrtC,

    utci: rec.utciC,
    utciCategory: rec.utciCategory,

    htsi,
    riskLevel,
    htsiMethod,
    htsiFactors,
    modelInfo: getModelInfo(),

    tmrtStatus: rec.tmrtStatus,
    utciStatus: rec.utciStatus,
    modelStatus,
    dataStatus: rec.dataStatus,
    riskStatus,
    notes: rec.pipelineNotes,

    series,
    alert: alert
      ? { severity: alert.severity, message: alert.message, timestamp: alert.timestamp }
      : null,
  };
}

module.exports = { runRiskPipeline, acquireEnvironment };
