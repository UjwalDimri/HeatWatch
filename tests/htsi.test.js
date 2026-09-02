'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { calculateHtsi } = require('../calculations/htsi');
const { calculateUtci } = require('../calculations/utci');

/* CRITICAL SCIENTIFIC TEST (spec §62):
   Two users, identical environment → identical UTCI, different HTSI. */
test('CRITICAL: same environment → same UTCI; different profiles → different HTSI', () => {
  const env = { airTemperatureC: 40, tmrtC: 58, windSpeed10mMs: 1.2, vapourPressureKpa: 2.5 };

  const utciA = calculateUtci(env);
  const utciB = calculateUtci(env);
  assert.equal(utciA.utciC, utciB.utciC, 'UTCI must be identical for identical environments');

  const userA = { // Outdoor labour, high exposure, heavy activity
    age: 38, ageVulnerabilityFlag: false, healthRiskCategory: 'low',
    outdoorExposureHours: 8, exposureCategory: 'very_high', activityLevel: 'heavy',
    occupationalHeatExposure: 'high', heatAcclimatization: 'high',
    coolingAccess: 'no', hydrationAccess: 'partial', shadeAccess: 'no',
    protectiveClothing: 'partial', breakFrequency: 'rare',
  };
  const userB = { // Computer science engineer, low exposure, light activity
    age: 38, ageVulnerabilityFlag: false, healthRiskCategory: 'low',
    outdoorExposureHours: 1, exposureCategory: 'low', activityLevel: 'light',
    occupationalHeatExposure: 'low', heatAcclimatization: 'low',
    coolingAccess: 'yes', hydrationAccess: 'yes', shadeAccess: 'yes',
    protectiveClothing: 'yes', breakFrequency: 'frequent',
  };

  const htsiA = calculateHtsi({ utciC: utciA.utciC, profile: userA });
  const htsiB = calculateHtsi({ utciC: utciB.utciC, profile: userB });
  assert.equal(htsiA.status, 'calculated');
  assert.equal(htsiB.status, 'calculated');
  assert.notEqual(htsiA.htsiScore, htsiB.htsiScore, 'HTSI should differ between the two profiles');
  assert.ok(htsiA.htsiScore > htsiB.htsiScore, 'the high-exposure heavy-activity profile should score higher');
});

test('HTSI is monotone in UTCI for a fixed profile', () => {
  const profile = { age: 30, exposureCategory: 'moderate', activityLevel: 'moderate' };
  const low = calculateHtsi({ utciC: 20, profile }).htsiScore;
  const mid = calculateHtsi({ utciC: 34, profile }).htsiScore;
  const high = calculateHtsi({ utciC: 44, profile }).htsiScore;
  assert.ok(low < mid && mid < high);
});

test('HTSI: unavailable UTCI → unavailable HTSI (no fake risk)', () => {
  const r = calculateHtsi({ utciC: null, profile: { age: 30 } });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.htsiScore, null);
  assert.equal(r.riskLevel, null);
});

test('HTSI explanations list contributing factors', () => {
  const r = calculateHtsi({
    utciC: 40,
    profile: { age: 70, ageVulnerabilityFlag: true, healthRiskCategory: 'high', exposureCategory: 'high', activityLevel: 'heavy' },
  });
  const names = r.factors.map((f) => f.factor);
  assert.ok(names.includes('age_vulnerability'));
  assert.ok(names.includes('health_risk_category'));
});
