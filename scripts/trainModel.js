'use strict';

/**
 * scripts/trainModel.js — train the HTSI Random Forest from
 * data/processed/htsi_training_data.csv (created by build:training).
 *
 *   npm run train:model [-- --max-rows 20000]
 *
 * Anti-leakage: rows are sorted chronologically and the split is
 * earlier → training, later → test (done inside ml/train.js).
 * Preprocessing is ml/features.js — identical to live prediction.
 * Model artifacts are version-stamped, never silently overwritten.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { buildFeatureVector } = require('../ml/features');
const { trainHtsiModel } = require('../ml/train');

const CSV = path.join(__dirname, '..', 'data', 'processed', 'htsi_training_data.csv');

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(','); // training CSV has no quoted commas in numeric/label cols we use
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

function main() {
  if (!fs.existsSync(CSV)) {
    console.error(`Training CSV not found: ${CSV}`);
    console.error('Build it first: npm run build:training -- --demo   (or with NASA POWER args)');
    process.exit(1);
  }
  const maxIdx = process.argv.indexOf('--max-rows');
  const maxRows = maxIdx >= 0 ? Number(process.argv[maxIdx + 1]) : 20000;

  let rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
  rows.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (rows.length > maxRows) {
    // Uniform chronological subsample keeps ordering intact (no leakage).
    const step = rows.length / maxRows;
    rows = Array.from({ length: maxRows }, (_, i) => rows[Math.floor(i * step)]);
  }

  const X = [];
  const y = [];
  const sources = new Set();
  for (const r of rows) {
    const record = {
      airTemperatureC: +r.air_temperature_c,
      relativeHumidityPercent: +r.relative_humidity_percent,
      windSpeed10mMs: +r.wind_speed_10m_ms,
      shortwaveRadiationWm2: +r.shortwave_radiation_wm2,
      vapourPressureKpa: +r.vapour_pressure_kpa,
      tmrtC: +r.tmrt_c,
      deltaTmrtC: +r.delta_tmrt_c,
      utciC: +r.utci_c,
    };
    const profile = {
      age: +r.age,
      ageVulnerabilityFlag: String(r.age_vulnerability_flag) === 'true',
      healthRiskCategory: r.health_risk_category,
      multipleHealthConditions: String(r.multiple_health_conditions) === 'true',
      outdoorExposureHours: +r.outdoor_exposure_hours,
      exposureCategory: r.exposure_category,
      activityLevel: r.activity_level,
      occupationalHeatExposure: r.occupational_heat_exposure,
      heatAcclimatization: r.heat_acclimatization,
      coolingAccess: r.cooling_access,
      hydrationAccess: r.hydration_access,
      shadeAccess: r.shade_access,
      protectiveClothing: r.protective_clothing,
      breakFrequency: r.break_frequency,
    };
    const label = Number(r.htsi_score);
    if (!Number.isFinite(label) || !Number.isFinite(record.utciC)) continue;
    X.push(buildFeatureVector(record, profile));
    y.push(label);
    sources.add(r.source);
  }

  console.log(`Training on ${X.length} rows (chronological order preserved)...`);
  const { metadata, metrics } = trainHtsiModel({
    X,
    y,
    datasetName: 'data/processed/htsi_training_data.csv',
    dataSources: [...sources],
  });

  console.log(`Model v${metadata.modelVersion} trained (${metadata.modelType}).`);
  console.log(`Test metrics: MAE=${metrics.test.mae} RMSE=${metrics.test.rmse} R²=${metrics.test.r2}`);
  console.log(`Risk-level accuracy: ${metrics.riskLevelClassification.accuracy}`);
  console.log('Artifacts: model_store/htsi_model.json, model_metadata.json, model_metrics.json');
  console.log('Reminder: labels are synthetic_rule prototype labels — not medically validated.');
}

main();
