'use strict';

/**
 * ml/features.js — single feature definition used by BOTH training
 * (scripts/trainModel.js) and live prediction (ml/predict.js), so the
 * preprocessing of live data is identical to training data.
 *
 * Environmental/thermal features + user-profile features only, exactly as
 * specified by the project. No arbitrary extra features.
 */

const ORDINALS = {
  healthRiskCategory: { low: 0, moderate: 1, high: 2, very_high: 3 },
  exposureCategory: { low: 0, moderate: 1, high: 2, very_high: 3 },
  activityLevel: { light: 0, moderate: 1, heavy: 2, very_heavy: 3 },
  occupationalHeatExposure: { low: 0, moderate: 1, high: 2 },
  heatAcclimatization: { low: 0, moderate: 1, high: 2 },
  coolingAccess: { no: 0, partial: 1, yes: 2 },
  hydrationAccess: { no: 0, partial: 1, yes: 2 },
  shadeAccess: { no: 0, partial: 1, yes: 2 },
  protectiveClothing: { no: 0, partial: 1, yes: 2 },
  breakFrequency: { rare: 0, occasional: 1, frequent: 2 },
};

const FEATURE_NAMES = [
  'air_temperature_c',
  'relative_humidity_percent',
  'wind_speed_10m_ms',
  'shortwave_radiation_wm2',
  'vapour_pressure_kpa',
  'tmrt_c',
  'delta_tmrt_c',
  'utci_c',
  'age',
  'age_vulnerability_flag',
  'health_risk_category_ord',
  'multiple_health_conditions',
  'outdoor_exposure_hours',
  'exposure_category_ord',
  'activity_level_ord',
  'occupational_heat_exposure_ord',
  'heat_acclimatization_ord',
  'cooling_access_ord',
  'hydration_access_ord',
  'shade_access_ord',
  'protective_clothing_ord',
  'break_frequency_ord',
];

function norm(v) {
  return String(v == null ? '' : v).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function ord(map, value, fallback = 0) {
  const v = map[norm(value)];
  return v === undefined ? fallback : v;
}

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

/**
 * Build the feature vector from an enriched canonical record + profile.
 * Order matches FEATURE_NAMES exactly.
 */
function buildFeatureVector(record, profile) {
  return [
    n(record.airTemperatureC),
    n(record.relativeHumidityPercent),
    n(record.windSpeed10mMs),
    n(record.shortwaveRadiationWm2),
    n(record.vapourPressureKpa),
    n(record.tmrtC),
    n(record.deltaTmrtC),
    n(record.utciC),
    n(profile.age),
    profile.ageVulnerabilityFlag ? 1 : 0,
    ord(ORDINALS.healthRiskCategory, profile.healthRiskCategory),
    profile.multipleHealthConditions ? 1 : 0,
    n(profile.outdoorExposureHours),
    ord(ORDINALS.exposureCategory, profile.exposureCategory),
    ord(ORDINALS.activityLevel, profile.activityLevel),
    ord(ORDINALS.occupationalHeatExposure, profile.occupationalHeatExposure),
    ord(ORDINALS.heatAcclimatization, profile.heatAcclimatization, 1),
    ord(ORDINALS.coolingAccess, profile.coolingAccess, 1),
    ord(ORDINALS.hydrationAccess, profile.hydrationAccess, 1),
    ord(ORDINALS.shadeAccess, profile.shadeAccess, 1),
    ord(ORDINALS.protectiveClothing, profile.protectiveClothing, 1),
    ord(ORDINALS.breakFrequency, profile.breakFrequency, 1),
  ];
}

module.exports = { FEATURE_NAMES, ORDINALS, buildFeatureVector };
