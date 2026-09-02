'use strict';
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

test('Open-Meteo normalization maps supported variables into the canonical schema', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      latitude: 27.2, longitude: 78.0,
      hourly: {
        time: ['2024-05-15T08:00'],
        temperature_2m: [39.4],
        relative_humidity_2m: [28],
        wind_speed_10m: [3.1],
        cloud_cover: [5],
        shortwave_radiation: [810],
        direct_radiation: [600],
        diffuse_radiation: [210],
        direct_normal_irradiance: [750],
      },
    }),
  });
  const openMeteo = require('../services/openMeteo');
  const { record } = await openMeteo.fetchLive(27.2, 78.0);
  assert.equal(record.source, 'open_meteo');
  assert.equal(record.airTemperatureC, 39.4);
  assert.equal(record.windSpeed10mMs, 3.1);
  assert.equal(record.shortwaveRadiationWm2, 810);
  assert.equal(record.utciC, null); // adapters never compute derived values
});

test('Open-Meteo failure throws and never fabricates weather', async () => {
  global.fetch = async () => { throw new Error('network down'); };
  const openMeteo = require('../services/openMeteo');
  await assert.rejects(() => openMeteo.fetchLive(27, 78), /Open-Meteo request failed/);
});

test('NASA POWER normalization: fill values become null, Ldown is captured', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      properties: {
        parameter: {
          T2M: { 2024051508: 39.0, 2024051509: -999 },
          RH2M: { 2024051508: 30, 2024051509: 31 },
          WS10M: { 2024051508: 2.5, 2024051509: 2.6 },
          ALLSKY_SFC_SW_DWN: { 2024051508: 800, 2024051509: 820 },
          ALLSKY_SFC_SW_DIFF: { 2024051508: 200, 2024051509: 210 },
          ALLSKY_SFC_SW_DNI: { 2024051508: 740, 2024051509: 750 },
          ALLSKY_SFC_LW_DWN: { 2024051508: 420, 2024051509: 425 },
        },
      },
    }),
  });
  const nasaPower = require('../services/nasaPower');
  const recs = await nasaPower.fetchHistoricalHourly(27.2, 78.0, '20240515', '20240515');
  assert.equal(recs.length, 2);
  assert.equal(recs[0].source, 'nasa_power');
  assert.equal(recs[0].longwaveDownWm2, 420);
  assert.equal(recs[1].airTemperatureC, null); // -999 fill → null, never a fake value
});

test('IMD adapter: unconfigured → explicit unavailable, no fabrication', async () => {
  delete process.env.IMD_API_BASE;
  const imd = require('../services/imd');
  assert.equal(imd.configured(), false);
  assert.equal(imd.getStatus().state, 'unconfigured');
  await assert.rejects(() => imd.fetchLive(27, 78), (err) => err.code === 'SOURCE_UNCONFIGURED');
});
