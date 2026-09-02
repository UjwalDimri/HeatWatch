'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { calculateUtci } = require('../calculations/utci');
const { calculateVapourPressure } = require('../calculations/vapourPressure');

function vp(t, rh) {
  return calculateVapourPressure({ airTemperatureC: t, relativeHumidityPercent: rh }).vapourPressureKpa;
}

test('UTCI matches the pythermalcomfort reference case (25/25/1.0/50% → 24.6 °C)', () => {
  const r = calculateUtci({ airTemperatureC: 25, tmrtC: 25, windSpeed10mMs: 1.0, vapourPressureKpa: vp(25, 50) });
  assert.equal(r.status, 'calculated');
  assert.ok(Math.abs(r.utciC - 24.6) <= 0.15, `got ${r.utciC}`);
});

test('UTCI: strong heat scenario is in the heat-stress range', () => {
  const r = calculateUtci({ airTemperatureC: 40, tmrtC: 60, windSpeed10mMs: 1.0, vapourPressureKpa: vp(40, 40) });
  assert.equal(r.status, 'calculated');
  assert.ok(r.utciC > 40, `got ${r.utciC}`);
});

test('UTCI is deterministic: identical inputs → identical outputs', () => {
  const inputs = { airTemperatureC: 33.3, tmrtC: 47.2, windSpeed10mMs: 2.1, vapourPressureKpa: 2.4 };
  assert.equal(calculateUtci(inputs).utciC, calculateUtci(inputs).utciC);
});

test('UTCI: low wind clamps to the official 0.5 m/s convention', () => {
  const a = calculateUtci({ airTemperatureC: 30, tmrtC: 40, windSpeed10mMs: 0.1, vapourPressureKpa: 2 });
  const b = calculateUtci({ airTemperatureC: 30, tmrtC: 40, windSpeed10mMs: 0.5, vapourPressureKpa: 2 });
  assert.equal(a.utciC, b.utciC);
});

test('UTCI: out-of-domain and missing inputs → unavailable (never fabricated)', () => {
  assert.equal(calculateUtci({ airTemperatureC: 60, tmrtC: 60, windSpeed10mMs: 1, vapourPressureKpa: 2 }).status, 'unavailable');
  assert.equal(calculateUtci({ airTemperatureC: 30, tmrtC: null, windSpeed10mMs: 1, vapourPressureKpa: 2 }).status, 'unavailable');
  assert.equal(calculateUtci({ airTemperatureC: 30, tmrtC: 120, windSpeed10mMs: 1, vapourPressureKpa: 2 }).status, 'unavailable');
});
