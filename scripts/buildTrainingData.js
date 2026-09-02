'use strict';

/**
 * scripts/buildTrainingData.js — historical/training pipeline.
 *
 *   NASA POWER (historical hourly, incl. measured Ldown)
 *        ↓ normalize into canonical schema
 *        ↓ validate
 *        ↓ vapour pressure → Tmrt → ΔTmrt → UTCI → category
 *          (services/thermalPipeline.js — the SAME code as the live path)
 *        ↓ join with synthetic vulnerability profiles
 *        ↓ transparent prototype HTSI labels (label_source = synthetic_rule)
 *        ↓ write weather_data.csv, utci_data.csv, htsi_training_data.csv
 *
 * Usage:
 *   npm run build:training -- --lat 27.18 --lon 78.01 --start 20240401 --end 20240430
 *   npm run build:training -- --demo          (no network: generates weather
 *                                              records clearly labelled
 *                                              source = synthetic_demo)
 *
 * Rows are written in chronological order so the trainer's earlier→train /
 * later→test split prevents data leakage.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { fetchHistoricalHourly } = require('../services/nasaPower');
const { runThermalPipeline } = require('../services/thermalPipeline');
const { makeCanonicalRecord } = require('../services/canonical');
const { calculateHtsi } = require('../calculations/htsi');
const { generate, mulberry32 } = require('./generateSyntheticProfiles');

const OUT_DIR = path.join(__dirname, '..', 'data', 'processed');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/** Clearly-labelled synthetic weather for offline demo/training only. */
function demoWeather({ latitude, longitude, hours, seed }) {
  const rand = mulberry32(seed);
  const records = [];
  const start = Date.UTC(2024, 3, 1); // fixed period for reproducibility
  for (let i = 0; i < hours; i += 1) {
    const ts = new Date(start + i * 3600000);
    const hour = ts.getUTCHours();
    const localHour = (hour + Math.round(longitude / 15) + 24) % 24;
    const diurnal = Math.sin(((localHour - 5) / 24) * 2 * Math.PI);
    const temp = 30 + 8 * diurnal + (rand() - 0.5) * 3;
    const daylight = localHour >= 6 && localHour <= 18;
    const solarShape = daylight ? Math.max(0, Math.sin(((localHour - 6) / 12) * Math.PI)) : 0;
    const cloud = Math.min(100, Math.max(0, 30 + (rand() - 0.5) * 60));
    const ghi = Math.round(solarShape * 900 * (1 - 0.6 * (cloud / 100)));
    const diffFrac = 0.25 + 0.5 * (cloud / 100);
    records.push(
      makeCanonicalRecord({
        timestamp: ts,
        latitude,
        longitude,
        source: 'synthetic_demo', // clearly labelled — never presented as observations
        airTemperatureC: +temp.toFixed(1),
        relativeHumidityPercent: +(35 + 30 * (1 - diurnal) * 0.5 + (rand() - 0.5) * 10).toFixed(0),
        windSpeed10mMs: +(1 + rand() * 4).toFixed(1),
        cloudCoverPercent: +cloud.toFixed(0),
        shortwaveRadiationWm2: ghi,
        diffuseRadiationWm2: Math.round(ghi * diffFrac),
        directRadiationWm2: Math.round(ghi * (1 - diffFrac)),
      })
    );
  }
  return records;
}

function writeCsv(file, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) =>
    v === null || v === undefined ? '' : typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v);
  fs.writeFileSync(path.join(OUT_DIR, file), [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
  console.log(`wrote ${file} (${rows.length} rows)`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const demo = process.argv.includes('--demo');
  const latitude = Number(arg('lat', 27.1767));
  const longitude = Number(arg('lon', 78.0081));

  let records;
  if (demo) {
    console.log('DEMO MODE: generating clearly-labelled synthetic_demo weather (no network, seed 42).');
    records = demoWeather({ latitude, longitude, hours: Number(arg('hours', 720)), seed: 42 });
  } else {
    const start = arg('start');
    const end = arg('end');
    if (!start || !end) {
      console.error('Provide --start YYYYMMDD and --end YYYYMMDD (or use --demo for offline mode).');
      process.exit(1);
    }
    console.log(`Fetching NASA POWER hourly for ${latitude},${longitude} ${start}–${end} ...`);
    records = await fetchHistoricalHourly(latitude, longitude, start, end);
  }

  // Same scientific pipeline as live -------------------------------------
  const enriched = records
    .map(runThermalPipeline)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const usable = enriched.filter((r) => r.utciC !== null);
  console.log(`records=${enriched.length} with UTCI=${usable.length} (others kept with unavailable status)`);

  // weather_data.csv ------------------------------------------------------
  writeCsv(
    'weather_data.csv',
    enriched.map((r) => ({
      timestamp: r.timestamp,
      latitude: r.latitude,
      longitude: r.longitude,
      source: r.source,
      air_temperature_c: r.airTemperatureC,
      relative_humidity_percent: r.relativeHumidityPercent,
      wind_speed_10m_ms: r.windSpeed10mMs,
      shortwave_radiation_wm2: r.shortwaveRadiationWm2,
      direct_radiation_wm2: r.directRadiationWm2,
      diffuse_radiation_wm2: r.diffuseRadiationWm2,
      direct_normal_irradiance_wm2: r.directNormalIrradianceWm2,
      longwave_down_wm2: r.longwaveDownWm2,
      data_status: r.dataStatus,
    }))
  );

  // utci_data.csv ---------------------------------------------------------
  writeCsv(
    'utci_data.csv',
    enriched.map((r) => ({
      timestamp: r.timestamp,
      latitude: r.latitude,
      longitude: r.longitude,
      air_temperature_c: r.airTemperatureC,
      relative_humidity_percent: r.relativeHumidityPercent,
      wind_speed_10m_ms: r.windSpeed10mMs,
      shortwave_radiation_wm2: r.shortwaveRadiationWm2,
      vapour_pressure_kpa: r.vapourPressureKpa,
      tmrt_c: r.tmrtC,
      delta_tmrt_c: r.deltaTmrtC,
      utci_c: r.utciC,
      utci_category: r.utciCategory,
      tmrt_status: r.tmrtStatus,
      utci_status: r.utciStatus,
      source: r.source,
    }))
  );

  // Join with synthetic profiles → htsi_training_data.csv -----------------
  const profileCount = Number(arg('profiles', 400));
  const csvPath = path.join(__dirname, '..', 'data', 'raw', 'user_vulnerability.csv');
  let profiles;
  if (fs.existsSync(csvPath)) {
    // reuse the generator's deterministic output rather than re-parsing CSV
    profiles = generate(profileCount, 42);
  } else {
    profiles = generate(profileCount, 42);
  }

  const rand = mulberry32(7);
  const training = [];
  for (const r of usable) {
    // pair each weather hour with a few random synthetic profiles
    for (let k = 0; k < 3; k += 1) {
      const p = profiles[Math.floor(rand() * profiles.length)];
      const profile = {
        age: p.age,
        ageVulnerabilityFlag: p.age_vulnerability_flag,
        healthRiskCategory: p.health_risk_category,
        multipleHealthConditions: p.multiple_health_conditions,
        outdoorExposureHours: p.outdoor_exposure_hours,
        exposureCategory: p.exposure_category,
        activityLevel: p.activity_level,
        occupationalHeatExposure: p.occupational_heat_exposure,
        heatAcclimatization: p.heat_acclimatization,
        coolingAccess: p.cooling_access,
        hydrationAccess: p.hydration_access,
        shadeAccess: p.shade_access,
        protectiveClothing: p.protective_clothing,
        breakFrequency: p.break_frequency,
      };
      const label = calculateHtsi({ utciC: r.utciC, profile });
      if (label.status !== 'calculated') continue;
      training.push({
        timestamp: r.timestamp,
        latitude: r.latitude,
        longitude: r.longitude,
        source: r.source,
        air_temperature_c: r.airTemperatureC,
        relative_humidity_percent: r.relativeHumidityPercent,
        wind_speed_10m_ms: r.windSpeed10mMs,
        shortwave_radiation_wm2: r.shortwaveRadiationWm2,
        direct_radiation_wm2: r.directRadiationWm2,
        diffuse_radiation_wm2: r.diffuseRadiationWm2,
        direct_normal_irradiance_wm2: r.directNormalIrradianceWm2,
        vapour_pressure_kpa: r.vapourPressureKpa,
        tmrt_c: r.tmrtC,
        delta_tmrt_c: r.deltaTmrtC,
        utci_c: r.utciC,
        utci_category: r.utciCategory,
        user_id: p.user_id,
        age: p.age,
        occupation: p.occupation,
        health_risk_category: p.health_risk_category,
        outdoor_exposure_hours: p.outdoor_exposure_hours,
        activity_level: p.activity_level,
        heat_acclimatization: p.heat_acclimatization,
        exposure_category: p.exposure_category,
        occupational_heat_exposure: p.occupational_heat_exposure,
        cooling_access: p.cooling_access,
        hydration_access: p.hydration_access,
        shade_access: p.shade_access,
        protective_clothing: p.protective_clothing,
        break_frequency: p.break_frequency,
        age_vulnerability_flag: p.age_vulnerability_flag,
        multiple_health_conditions: p.multiple_health_conditions,
        htsi_score: label.htsiScore,
        risk_level: label.riskLevel,
        label_source: 'synthetic_rule',
      });
    }
  }
  writeCsv('htsi_training_data.csv', training);
  console.log('Labels are prototype synthetic_rule labels — not medical outcomes, not medically validated.');
}

main().catch((err) => {
  console.error(`Training-data build failed: ${err.message}`);
  process.exit(1);
});
