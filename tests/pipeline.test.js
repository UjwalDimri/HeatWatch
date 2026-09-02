'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runThermalPipeline } = require('../services/thermalPipeline');
const { makeCanonicalRecord } = require('../services/canonical');

const full = () =>
  makeCanonicalRecord({
    timestamp: new Date('2024-05-15T08:00:00Z'),
    latitude: 27.18,
    longitude: 78.01,
    source: 'open_meteo',
    airTemperatureC: 38,
    relativeHumidityPercent: 30,
    windSpeed10mMs: 2.5,
    cloudCoverPercent: 10,
    shortwaveRadiationWm2: 820,
    directRadiationWm2: 600,
    diffuseRadiationWm2: 220,
    directNormalIrradianceWm2: 760,
  });

test('complete record flows to a UTCI with statuses', () => {
  const r = runThermalPipeline(full());
  assert.equal(r.utciStatus, 'calculated');
  assert.equal(typeof r.utciC, 'number');
  assert.equal(r.tmrtStatus, 'approximation'); // Open-Meteo has no long-wave
  assert.equal(typeof r.deltaTmrtC, 'number');
  assert.ok(r.utciCategory.includes('heat stress'));
});

test('MISSING RADIATION: tmrt unavailable → utci unavailable → clear explanation', () => {
  const rec = full();
  rec.shortwaveRadiationWm2 = null;
  rec.diffuseRadiationWm2 = null;
  rec.directRadiationWm2 = null;
  rec.directNormalIrradianceWm2 = null;
  const r = runThermalPipeline(rec);
  assert.equal(r.tmrtStatus, 'unavailable');
  assert.equal(r.tmrtC, null);
  assert.equal(r.utciStatus, 'unavailable');
  assert.equal(r.utciC, null);
  assert.equal(r.utciCategory, null);
  assert.ok(
    r.pipelineNotes.some((n) => n.includes('UTCI cannot currently be calculated')),
    'must explain why UTCI is unavailable'
  );
  // crucial: air temperature was NOT silently substituted for Tmrt
  assert.notEqual(r.tmrtC, r.airTemperatureC);
});

test('missing humidity: vapour pressure and UTCI unavailable, nothing invented', () => {
  const rec = full();
  rec.relativeHumidityPercent = null;
  const r = runThermalPipeline(rec);
  assert.equal(r.vapourPressureKpa, null);
  assert.equal(r.utciStatus, 'unavailable');
});

test('training/live consistency: same record through the same pipeline twice → identical output', () => {
  const a = runThermalPipeline(full());
  const b = runThermalPipeline(full());
  assert.equal(a.utciC, b.utciC);
  assert.equal(a.tmrtC, b.tmrtC);
  assert.equal(a.vapourPressureKpa, b.vapourPressureKpa);
});
