'use strict';

/**
 * calculations/vapourPressure.js
 *
 * Water vapour pressure from air temperature and relative humidity.
 *
 * FORMULA: Magnus–Tetens saturation vapour pressure over water
 *   es(T) = 0.6108 · exp( 17.27·T / (T + 237.3) )   [kPa], T in °C
 *   e     = (RH / 100) · es(T)                       [kPa]
 *
 * INPUT UNITS:  airTemperatureC in °C, relativeHumidityPercent in %
 * OUTPUT UNITS: kPa (the unit expected by calculations/utci.js, whose
 *               polynomial variable `pa` is in kPa)
 *
 * ASSUMPTIONS:
 *  - Saturation over a plane water surface (standard for above-freezing
 *    outdoor heat-stress work; the Magnus constants used are valid roughly
 *    for −40 °C to +50 °C with small error below 0 °C).
 *  - RH is the standard 2 m relative humidity.
 *
 * Relative humidity is never fed directly into the UTCI polynomial; it is
 * always converted to vapour pressure here first.
 */

function saturationVapourPressureKpa(airTemperatureC) {
  return 0.6108 * Math.exp((17.27 * airTemperatureC) / (airTemperatureC + 237.3));
}

/**
 * @param {object} p
 * @param {number} p.airTemperatureC
 * @param {number} p.relativeHumidityPercent
 * @returns {{vapourPressureKpa:(number|null), status:string, reason?:string}}
 */
function calculateVapourPressure({ airTemperatureC, relativeHumidityPercent }) {
  if (
    typeof airTemperatureC !== 'number' || !Number.isFinite(airTemperatureC) ||
    typeof relativeHumidityPercent !== 'number' || !Number.isFinite(relativeHumidityPercent)
  ) {
    return { vapourPressureKpa: null, status: 'unavailable', reason: 'Air temperature or relative humidity missing.' };
  }
  if (relativeHumidityPercent < 0 || relativeHumidityPercent > 100) {
    return { vapourPressureKpa: null, status: 'unavailable', reason: 'Relative humidity outside 0–100 %.' };
  }
  if (airTemperatureC < -60 || airTemperatureC > 60) {
    return { vapourPressureKpa: null, status: 'unavailable', reason: 'Air temperature outside plausible range (−60 to 60 °C).' };
  }
  const e = (relativeHumidityPercent / 100) * saturationVapourPressureKpa(airTemperatureC);
  return { vapourPressureKpa: Math.round(e * 1000) / 1000, status: 'calculated' };
}

module.exports = { calculateVapourPressure, saturationVapourPressureKpa };
