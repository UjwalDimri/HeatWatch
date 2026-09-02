'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { calculateTmrt, solarElevationDeg } = require('../calculations/tmrt');

const base = {
  airTemperatureC: 35,
  vapourPressureKpa: 2.0,
  shortwaveRadiationWm2: 800,
  diffuseRadiationWm2: 200,
  directNormalIrradianceWm2: 750,
  cloudCoverPercent: 10,
  latitude: 27.18,
  longitude: 78.01,
  timestamp: '2024-05-15T08:00:00Z', // ~13:30 IST, high sun
};

test('Tmrt: sunny midday result is physical and above air temperature', () => {
  const r = calculateTmrt(base);
  assert.equal(r.status, 'approximation'); // long-wave estimated → labelled
  assert.ok(r.note && r.note.includes('approximation'), 'approximation must be explained');
  assert.ok(r.tmrtC > base.airTemperatureC, `expected Tmrt > Ta, got ${r.tmrtC}`);
  assert.ok(r.tmrtC < 90, `implausible Tmrt ${r.tmrtC}`);
});

test('Tmrt: measured long-wave input → status calculated', () => {
  const r = calculateTmrt({ ...base, longwaveDownWm2: 400, longwaveUpWm2: 520 });
  assert.equal(r.status, 'calculated');
});

test('Tmrt: missing radiation → unavailable, air temperature NOT substituted', () => {
  const r = calculateTmrt({ ...base, shortwaveRadiationWm2: null, diffuseRadiationWm2: null });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.tmrtC, null);
});

test('Tmrt: night (no sun) still valid — long-wave dominated, near air temperature', () => {
  const r = calculateTmrt({
    ...base,
    shortwaveRadiationWm2: 0,
    diffuseRadiationWm2: 0,
    directNormalIrradianceWm2: 0,
    timestamp: '2024-05-15T20:00:00Z',
  });
  assert.notEqual(r.status, 'unavailable');
  assert.ok(Math.abs(r.tmrtC - base.airTemperatureC) < 12, `night Tmrt ${r.tmrtC} too far from Ta`);
});

test('solar elevation: positive at local noon, negative at local midnight (Agra)', () => {
  assert.ok(solarElevationDeg(new Date('2024-06-21T06:30:00Z'), 27.18, 78.01) > 60);
  assert.ok(solarElevationDeg(new Date('2024-06-21T18:30:00Z'), 27.18, 78.01) < 0);
});
