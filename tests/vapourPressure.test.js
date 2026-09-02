'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { calculateVapourPressure } = require('../calculations/vapourPressure');

test('vapour pressure: known Magnus values', () => {
  // es(25°C) ≈ 3.17 kPa → at 50% RH e ≈ 1.585 kPa
  const r = calculateVapourPressure({ airTemperatureC: 25, relativeHumidityPercent: 50 });
  assert.equal(r.status, 'calculated');
  assert.ok(Math.abs(r.vapourPressureKpa - 1.585) < 0.02, `got ${r.vapourPressureKpa}`);
});

test('vapour pressure: saturation at 20°C ≈ 2.34 kPa', () => {
  const r = calculateVapourPressure({ airTemperatureC: 20, relativeHumidityPercent: 100 });
  assert.ok(Math.abs(r.vapourPressureKpa - 2.34) < 0.03, `got ${r.vapourPressureKpa}`);
});

test('vapour pressure: missing/invalid inputs are unavailable, never fabricated', () => {
  assert.equal(calculateVapourPressure({ airTemperatureC: null, relativeHumidityPercent: 50 }).status, 'unavailable');
  assert.equal(calculateVapourPressure({ airTemperatureC: 25, relativeHumidityPercent: 140 }).status, 'unavailable');
  assert.equal(calculateVapourPressure({ airTemperatureC: 25, relativeHumidityPercent: 140 }).vapourPressureKpa, null);
});
