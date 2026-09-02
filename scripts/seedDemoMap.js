'use strict';

/**
 * scripts/seedDemoMap.js — populate the government GIS dashboard for demos.
 *
 *   node scripts/seedDemoMap.js [--live]
 *
 * Default (offline-safe): generates ONE clearly-labelled synthetic_demo
 * weather record per monitored city (source = "synthetic_demo",
 * dataStatus = "demo"), runs the real thermal + HTSI pipeline on it, and
 * stores the prediction. The UI marks these points "SYNTHETIC / DEMO DATA".
 * Demo data is never made to look like live official observations.
 *
 * With --live: fetches real Open-Meteo data per city instead (requires
 * network); those points carry source = "open_meteo" honestly.
 */

require('dotenv').config();
const { connectDatabase } = require('../config/database');
const { runThermalPipeline } = require('../services/thermalPipeline');
const { makeCanonicalRecord } = require('../services/canonical');
const { calculateHtsi } = require('../calculations/htsi');
const { generate, mulberry32 } = require('./generateSyntheticProfiles');
const openMeteo = require('../services/openMeteo');

const CITIES = [
  ['Agra', 'Uttar Pradesh', 27.1767, 78.0081],
  ['Aligarh', 'Uttar Pradesh', 27.8974, 78.088],
  ['Lucknow', 'Uttar Pradesh', 26.8467, 80.9462],
  ['Delhi', 'Delhi', 28.6139, 77.209],
  ['Jaipur', 'Rajasthan', 26.9124, 75.7873],
  ['Jodhpur', 'Rajasthan', 26.2389, 73.0243],
  ['Ahmedabad', 'Gujarat', 23.0225, 72.5714],
  ['Nagpur', 'Maharashtra', 21.1458, 79.0882],
  ['Hyderabad', 'Telangana', 17.385, 78.4867],
  ['Chennai', 'Tamil Nadu', 13.0827, 80.2707],
  ['Bhubaneswar', 'Odisha', 20.2961, 85.8245],
  ['Patna', 'Bihar', 25.5941, 85.1376],
];

async function main() {
  const live = process.argv.includes('--live');
  await connectDatabase();
  const RiskPrediction = require('../models/RiskPrediction');
  const Location = require('../models/Location');

  const rand = mulberry32(42);
  const profiles = generate(50, 42);
  let stored = 0;

  for (const [name, state, lat, lon] of CITIES) {
    await Location.updateOne(
      { name },
      { $set: { name, state, latitude: lat, longitude: lon } },
      { upsert: true }
    );

    let canonical;
    if (live) {
      try {
        canonical = (await openMeteo.fetchLive(lat, lon)).record;
      } catch (err) {
        console.warn(`Open-Meteo failed for ${name} (${err.message}) — skipping (no fabrication).`);
        continue;
      }
    } else {
      // Clearly-labelled synthetic demo conditions (midday heat scenario).
      const temp = 36 + rand() * 8;
      const ghi = 650 + rand() * 300;
      canonical = makeCanonicalRecord({
        timestamp: new Date(),
        latitude: lat,
        longitude: lon,
        source: 'synthetic_demo',
        airTemperatureC: +temp.toFixed(1),
        relativeHumidityPercent: Math.round(25 + rand() * 40),
        windSpeed10mMs: +(0.8 + rand() * 4).toFixed(1),
        cloudCoverPercent: Math.round(rand() * 40),
        shortwaveRadiationWm2: Math.round(ghi),
        diffuseRadiationWm2: Math.round(ghi * 0.3),
        directRadiationWm2: Math.round(ghi * 0.7),
      });
    }

    const rec = runThermalPipeline(canonical);
    const p = profiles[Math.floor(rand() * profiles.length)];
    const htsi =
      rec.utciC === null
        ? { htsiScore: null, riskLevel: null, status: 'unavailable' }
        : calculateHtsi({
            utciC: rec.utciC,
            profile: {
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
            },
          });

    await RiskPrediction.create({
      userId: null,
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
      htsi: htsi.htsiScore,
      riskLevel: htsi.riskLevel,
      dataStatus: live ? rec.dataStatus : 'demo',
      tmrtStatus: rec.tmrtStatus,
      utciStatus: rec.utciStatus,
      modelStatus: htsi.status,
    });
    stored += 1;
    console.log(`${name}: source=${rec.source} UTCI=${rec.utciC} HTSI=${htsi.htsiScore} risk=${htsi.riskLevel}`);
  }

  console.log(`Stored ${stored} points (${live ? 'live open_meteo' : 'clearly-labelled synthetic_demo'}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
