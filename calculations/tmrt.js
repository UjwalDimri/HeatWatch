'use strict';

/**
 * calculations/tmrt.js
 *
 * Mean Radiant Temperature (Tmrt) for a standing person outdoors, derived
 * from short-wave radiation components plus long-wave radiation terms.
 *
 * METHODOLOGY (radiation-balance form, VDI 3787-2 / RayMan-style):
 *
 *   Tmrt = [ (1/σ) · ( (αir/εp)·(fa·Ldown + fa·Lup)
 *                    + (αk/εp)·(fa·Sdiff + fa·Sref + fp·Idirect) ) ]^(1/4) − 273.15
 *
 *   σ  = 5.670374419e-8 W/(m²·K⁴)   Stefan–Boltzmann constant
 *   αk = 0.7                        short-wave absorption coefficient of a person
 *   εp = 0.97                       long-wave emissivity of a person (αir = εp)
 *   fa = 0.5                        angle factor for the upper / lower hemisphere
 *   fp                              projected-body factor for a standing person,
 *                                   fp = 0.308 · cos( γ · (0.998 − γ²/50000) ),
 *                                   γ = solar elevation in degrees
 *   Ldown, Lup                      downward / upward long-wave radiation, W/m²
 *   Sdiff                           diffuse short-wave radiation, W/m²
 *   Sref                            ground-reflected short-wave = albedo·GHI, W/m²
 *                                   (ground albedo assumed 0.2)
 *   Idirect                         direct-beam irradiance on the person = DNI, W/m²
 *
 * DATA REALITY AND STATUS LABELING — read carefully:
 *   The specified live source (Open-Meteo forecast API) provides the
 *   SHORT-WAVE terms (shortwave_radiation = GHI, direct_radiation,
 *   diffuse_radiation, direct_normal_irradiance) but does NOT provide
 *   measured Ldown/Lup. Therefore:
 *
 *   - If Ldown/Lup are supplied (e.g. from a source that has them), Tmrt is
 *     computed from them directly → tmrtStatus = "calculated".
 *   - Otherwise this module runs an EXPLICIT, CLEARLY LABELLED APPROXIMATION
 *     MODE: Ldown is estimated with the Brunt clear-sky formula corrected
 *     for cloud cover, and Lup from surface temperature ≈ air temperature.
 *     The result is returned with tmrtStatus = "approximation" and a
 *     human-readable note. Approximated Tmrt is never represented as
 *     measured Tmrt.
 *   - If the required short-wave inputs are missing, or long-wave can not
 *     even be approximated, → tmrt = null, tmrtStatus = "unavailable".
 *     Air temperature is NEVER silently substituted for Tmrt.
 *
 * Long-wave approximation (labelled, documented):
 *   Brunt clear-sky emissivity  ε_sky = 0.52 + 0.065·√(e_hPa)
 *   Cloud correction            ε_eff = ε_sky·(1 + 0.22·c²), c = cloud fraction 0–1
 *   Ldown = ε_eff · σ · Ta_K⁴
 *   Lup   = ε_g  · σ · Ts_K⁴  with ε_g = 0.95 and Ts ≈ Ta (approximation)
 */

const SIGMA = 5.670374419e-8;
const ALPHA_K = 0.7; // short-wave absorption of the human body
const EPS_P = 0.97; // long-wave emissivity of the human body
const ALPHA_IR = EPS_P; // Kirchhoff: long-wave absorption = emissivity
const F_A = 0.5; // hemispheric angle factor
const GROUND_ALBEDO = 0.2;
const EPS_GROUND = 0.95;

/** Solar elevation angle (degrees) — NOAA simplified algorithm. */
function solarElevationDeg(dateUtc, latitude, longitude) {
  const rad = Math.PI / 180;
  const start = Date.UTC(dateUtc.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((dateUtc.getTime() - start) / 86400000);
  const hoursUtc =
    dateUtc.getUTCHours() + dateUtc.getUTCMinutes() / 60 + dateUtc.getUTCSeconds() / 3600;

  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hoursUtc - 12) / 24);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const timeOffset = eqTime + 4 * longitude;
  const trueSolarTime = hoursUtc * 60 + timeOffset;
  const hourAngle = trueSolarTime / 4 - 180;

  const cosZenith =
    Math.sin(latitude * rad) * Math.sin(decl) +
    Math.cos(latitude * rad) * Math.cos(decl) * Math.cos(hourAngle * rad);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
  return 90 - zenith / rad;
}

/** Projected-body factor for a standing person (γ in degrees). */
function projectedBodyFactor(solarElevDeg) {
  const g = Math.max(0, solarElevDeg);
  return 0.308 * Math.cos((Math.PI / 180) * (g * (0.998 - (g * g) / 50000)));
}

function isNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * @param {object} p
 * @param {number} p.airTemperatureC
 * @param {number} p.vapourPressureKpa               used for long-wave approximation
 * @param {number} p.shortwaveRadiationWm2           GHI
 * @param {number} p.diffuseRadiationWm2             Sdiff
 * @param {number} [p.directRadiationWm2]            direct on horizontal plane
 * @param {number} [p.directNormalIrradianceWm2]     DNI (preferred for Idirect)
 * @param {number} [p.longwaveDownWm2]               measured Ldown, if the source has it
 * @param {number} [p.longwaveUpWm2]                 measured Lup, if the source has it
 * @param {number} [p.cloudCoverPercent]             for the long-wave approximation
 * @param {number} p.latitude
 * @param {number} p.longitude
 * @param {string|Date} p.timestamp                  UTC timestamp of the record
 * @returns {{tmrtC:(number|null), status:'calculated'|'approximation'|'unavailable', note?:string, reason?:string}}
 */
function calculateTmrt(p) {
  const {
    airTemperatureC,
    vapourPressureKpa,
    shortwaveRadiationWm2,
    diffuseRadiationWm2,
    directRadiationWm2,
    directNormalIrradianceWm2,
    longwaveDownWm2,
    longwaveUpWm2,
    cloudCoverPercent,
    latitude,
    longitude,
    timestamp,
  } = p;

  // ---- required inputs -------------------------------------------------
  if (!isNum(airTemperatureC)) {
    return { tmrtC: null, status: 'unavailable', reason: 'Air temperature missing — Tmrt cannot be derived.' };
  }
  if (!isNum(shortwaveRadiationWm2) || !isNum(diffuseRadiationWm2)) {
    return {
      tmrtC: null,
      status: 'unavailable',
      reason: 'Required short-wave radiation inputs (global and diffuse) are unavailable from the data source.',
    };
  }
  if (!isNum(latitude) || !isNum(longitude) || !timestamp) {
    return { tmrtC: null, status: 'unavailable', reason: 'Location/timestamp missing — solar geometry cannot be computed.' };
  }
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return { tmrtC: null, status: 'unavailable', reason: 'Invalid timestamp for solar geometry.' };
  }

  const taK = airTemperatureC + 273.15;
  const elev = solarElevationDeg(date, latitude, longitude);

  // ---- direct beam on the person --------------------------------------
  let iDirect = 0;
  if (elev > 1) {
    if (isNum(directNormalIrradianceWm2)) {
      iDirect = Math.max(0, directNormalIrradianceWm2);
    } else if (isNum(directRadiationWm2)) {
      // convert direct-on-horizontal to normal incidence
      iDirect = Math.max(0, directRadiationWm2) / Math.sin((elev * Math.PI) / 180);
      iDirect = Math.min(iDirect, 1100); // physical cap on DNI
    }
  }

  const sDiff = Math.max(0, diffuseRadiationWm2);
  const sRef = GROUND_ALBEDO * Math.max(0, shortwaveRadiationWm2);
  const fp = projectedBodyFactor(elev);

  // ---- long-wave terms -------------------------------------------------
  let lDown;
  let lUp;
  let status = 'calculated';
  let note;

  if (isNum(longwaveDownWm2) && isNum(longwaveUpWm2)) {
    lDown = longwaveDownWm2;
    lUp = longwaveUpWm2;
  } else {
    // EXPLICIT APPROXIMATION MODE — see module header.
    if (!isNum(vapourPressureKpa)) {
      return {
        tmrtC: null,
        status: 'unavailable',
        reason: 'Long-wave radiation is not measured by the source and cannot be approximated without vapour pressure.',
      };
    }
    const eHpa = vapourPressureKpa * 10;
    let epsSky = 0.52 + 0.065 * Math.sqrt(Math.max(0, eHpa)); // Brunt
    if (isNum(cloudCoverPercent)) {
      const c = Math.min(1, Math.max(0, cloudCoverPercent / 100));
      epsSky = epsSky * (1 + 0.22 * c * c);
    }
    epsSky = Math.min(1, epsSky);
    lDown = epsSky * SIGMA * Math.pow(taK, 4);
    lUp = EPS_GROUND * SIGMA * Math.pow(taK, 4); // Ts ≈ Ta approximation
    status = 'approximation';
    note =
      'Long-wave radiation is not provided by the environmental source; Ldown was estimated with a Brunt-type ' +
      'clear-sky formula (cloud-corrected) and Lup from surface ≈ air temperature. Tmrt is therefore an ' +
      'explicitly labelled approximation, not a measured value.';
  }

  // ---- radiation balance ----------------------------------------------
  const meanRadiantFlux =
    (ALPHA_IR / EPS_P) * (F_A * lDown + F_A * lUp) +
    (ALPHA_K / EPS_P) * (F_A * sDiff + F_A * sRef + fp * iDirect);

  if (!(meanRadiantFlux > 0)) {
    return { tmrtC: null, status: 'unavailable', reason: 'Radiation balance produced a non-physical flux.' };
  }

  const tmrtK = Math.pow(meanRadiantFlux / SIGMA, 0.25);
  const tmrtC = Math.round((tmrtK - 273.15) * 10) / 10;

  if (!Number.isFinite(tmrtC) || tmrtC < -80 || tmrtC > 100) {
    return { tmrtC: null, status: 'unavailable', reason: 'Derived Tmrt outside plausible physical range.' };
  }
  return { tmrtC, status, note };
}

module.exports = { calculateTmrt, solarElevationDeg, projectedBodyFactor, SIGMA };
