'use strict';

/**
 * config/bootstrap.js
 * Automatically ensures default demo accounts and initial regional map telemetry
 * exist upon database connection, so deployments (like Render) work out-of-the-box
 * without requiring manual offline seeding scripts.
 */

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const RiskPrediction = require('../models/RiskPrediction');
const Location = require('../models/Location');
const { runThermalPipeline } = require('../services/thermalPipeline');
const { makeCanonicalRecord } = require('../services/canonical');
const { calculateHtsi } = require('../calculations/htsi');

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

async function ensureInitialData() {
  try {
    const demoPassword = process.env.DEMO_PASSWORD || 'heatwatch-demo';
    const hash = await bcrypt.hash(demoPassword, 10);
    const forceReset = process.env.RESET_DEMO_PASSWORD === 'true';

    const defaultAccounts = [
      { name: 'Demo Admin', email: 'admin@heatwatch.demo', role: 'admin' },
      { name: 'Demo Government', email: 'government@heatwatch.demo', role: 'government' },
      { name: 'Demo Citizen', email: 'citizen@heatwatch.demo', role: 'citizen' },
    ];

    for (const acc of defaultAccounts) {
      let user = await User.findOne({ email: acc.email });
      if (!user) {
        user = await User.create({
          name: acc.name,
          email: acc.email,
          passwordHash: hash,
          role: acc.role,
        });
        console.log(`[Bootstrap] Auto-seeded default account: ${acc.email} (${acc.role})`);
      } else if (forceReset) {
        user.passwordHash = hash;
        await user.save();
        console.log(`[Bootstrap] Reset password for account: ${acc.email}`);
      }

      if (acc.role === 'citizen') {
        const prof = await UserProfile.findOne({ userId: user._id });
        if (!prof) {
          await UserProfile.create({
            userId: user._id,
            age: 30,
            ageGroup: 'adult',
            occupation: 'Civil Engineer',
            occupationCategory: 'outdoor_service',
            outdoorExposureHours: 4,
            exposureCategory: 'high',
            activityLevel: 'moderate',
            healthRiskCategory: 'low',
            healthCondition: 'none',
            multipleHealthConditions: false,
            ageVulnerabilityFlag: false,
            coolingAccess: 'partial',
            hydrationAccess: 'yes',
            protectiveClothing: 'yes',
            shadeAccess: 'partial',
            breakFrequency: 'occasional',
            city: 'New Delhi',
            state: 'Delhi',
            latitude: 28.6139,
            longitude: 77.2090,
            dataType: 'user',
          });
        }
      }
    }

    // Auto-seed initial regional map points if collection is empty
    const pointsCount = await RiskPrediction.countDocuments();
    if (pointsCount === 0) {
      console.log('[Bootstrap] Seeding initial demo assessment points for regional map...');
      for (const [name, state, lat, lon] of CITIES) {
        await Location.updateOne(
          { name },
          { $set: { name, state, latitude: lat, longitude: lon } },
          { upsert: true }
        );

        const temp = 36 + Math.random() * 7;
        const ghi = 600 + Math.random() * 300;
        const canonical = makeCanonicalRecord({
          timestamp: new Date(),
          latitude: lat,
          longitude: lon,
          source: 'synthetic_demo',
          airTemperatureC: +temp.toFixed(1),
          relativeHumidityPercent: Math.round(25 + Math.random() * 35),
          windSpeed10mMs: +(1.2 + Math.random() * 3).toFixed(1),
          cloudCoverPercent: 10,
          shortwaveRadiationWm2: Math.round(ghi),
          diffuseRadiationWm2: Math.round(ghi * 0.3),
          directRadiationWm2: Math.round(ghi * 0.7),
        });

        const rec = runThermalPipeline(canonical);
        const dummyProfile = {
          age: 35,
          ageVulnerabilityFlag: false,
          healthRiskCategory: 'moderate',
          multipleHealthConditions: false,
          outdoorExposureHours: 5,
          exposureCategory: 'high',
          activityLevel: 'moderate',
          occupationalHeatExposure: 'moderate',
          heatAcclimatization: 'moderate',
          coolingAccess: 'partial',
          hydrationAccess: 'yes',
          protectiveClothing: 'partial',
          shadeAccess: 'partial',
          breakFrequency: 'occasional',
        };

        const htsiResult = rec.utciC !== null ? calculateHtsi({ utciC: rec.utciC, profile: dummyProfile }) : null;

        await RiskPrediction.create({
          timestamp: new Date(),
          latitude: lat,
          longitude: lon,
          source: 'synthetic_demo',
          temperature: rec.airTemperatureC,
          relativeHumidity: rec.relativeHumidityPercent,
          windSpeed: rec.windSpeed10mMs,
          solarRadiation: rec.shortwaveRadiationWm2,
          vapourPressure: rec.vapourPressureKpa,
          tmrt: rec.tmrtC,
          deltaTmrt: rec.deltaTmrtC,
          utci: rec.utciC,
          utciCategory: rec.utciCategory,
          htsi: htsiResult ? htsiResult.htsiScore : null,
          riskLevel: htsiResult ? htsiResult.riskLevel : null,
          dataStatus: 'demo',
          tmrtStatus: rec.tmrtStatus,
          utciStatus: rec.utciStatus,
          modelStatus: 'calculated',
        });
      }
      console.log('[Bootstrap] Initial regional map points seeded.');
    }
  } catch (err) {
    console.warn('[Bootstrap] Initial data bootstrap warning:', err.message);
  }
}

module.exports = { ensureInitialData };
