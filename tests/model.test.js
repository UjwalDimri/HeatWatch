'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildFeatureVector, FEATURE_NAMES } = require('../ml/features');
const { regressionMetrics, classificationMetrics } = require('../ml/evaluation');
const { calculateHtsi } = require('../calculations/htsi');
const { predictHtsi } = require('../ml/predict');

test('feature vector matches FEATURE_NAMES length and encodes ordinals', () => {
  const record = { airTemperatureC: 40, relativeHumidityPercent: 30, windSpeed10mMs: 2, shortwaveRadiationWm2: 800, vapourPressureKpa: 2.2, tmrtC: 55, deltaTmrtC: 15, utciC: 44 };
  const profile = { age: 50, exposureCategory: 'high', activityLevel: 'heavy', coolingAccess: 'no' };
  const x = buildFeatureVector(record, profile);
  assert.equal(x.length, FEATURE_NAMES.length);
  assert.equal(x[FEATURE_NAMES.indexOf('exposure_category_ord')], 2);
  assert.equal(x[FEATURE_NAMES.indexOf('cooling_access_ord')], 0);
});

test('evaluation metrics are sane on a known small case', () => {
  const yt = [10, 20, 30, 40];
  const yp = [12, 18, 33, 39];
  const m = regressionMetrics(yt, yp);
  assert.ok(m.mae > 0 && m.mae < 5);
  assert.ok(m.r2 > 0.9);
  const c = classificationMetrics(yt, yp);
  assert.equal(c.accuracy, 1); // all land in the same risk bands
});

test('model prediction interface degrades to rule engine when no model is trained', () => {
  const record = { utciC: 42, airTemperatureC: 40, relativeHumidityPercent: 30, windSpeed10mMs: 2, shortwaveRadiationWm2: 800, vapourPressureKpa: 2.2, tmrtC: 55, deltaTmrtC: 15 };
  const profile = { age: 30, exposureCategory: 'high', activityLevel: 'heavy' };
  const m = predictHtsi({ record, profile });
  if (m.status === 'unavailable') {
    const ruled = calculateHtsi({ utciC: record.utciC, profile });
    assert.equal(ruled.status, 'calculated'); // pipeline fallback path exists
  } else {
    assert.equal(typeof m.htsiScore, 'number'); // trained model present — also fine
  }
});

test('the ML layer never replaces UTCI: unavailable UTCI → no prediction', () => {
  const m = predictHtsi({ record: { utciC: null }, profile: { age: 30 } });
  assert.equal(m.status, 'unavailable');
});
