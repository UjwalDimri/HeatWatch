'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { makeCanonicalRecord, validateCanonicalRecord, validCoordinates } = require('../services/canonical');

test('canonical record preserves lineage fields and rejects unknown sources', () => {
  const rec = makeCanonicalRecord({
    timestamp: new Date('2024-05-01T10:00:00Z'),
    latitude: 27.1,
    longitude: 78.0,
    source: 'open_meteo',
    airTemperatureC: 38,
    relativeHumidityPercent: 30,
    windSpeed10mMs: 2,
  });
  assert.equal(rec.source, 'open_meteo');
  assert.ok(rec.retrievedAt);
  assert.equal(rec.sourceTimestamp, '2024-05-01T10:00:00.000Z');
  assert.equal(rec.utciC, null); // derived values start empty
  assert.throws(() => makeCanonicalRecord({ timestamp: new Date(), latitude: 0, longitude: 0, source: 'weather_dot_com' }));
});

test('validation reports missing source variables without inventing them', () => {
  const rec = makeCanonicalRecord({
    timestamp: new Date(), latitude: 27, longitude: 78, source: 'imd',
    airTemperatureC: 40, relativeHumidityPercent: null, windSpeed10mMs: 3,
  });
  const v = validateCanonicalRecord(rec);
  assert.equal(v.ok, false);
  assert.deepEqual(v.missing, ['relative humidity']);
});

test('coordinate validation', () => {
  assert.ok(validCoordinates(27.1, 78.0));
  assert.ok(!validCoordinates(97, 78));
  assert.ok(!validCoordinates('abc', 78));
});
