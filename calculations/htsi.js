'use strict';

/**
 * calculations/htsi.js
 *
 * HTSI — Human Thermal Stress Index (HeatWatch's PERSONALIZED layer).
 *
 * HTSI sits strictly AFTER the deterministic scientific UTCI calculation:
 *
 *   environment → vapour pressure + Tmrt → UTCI  (same for everyone)
 *   UTCI + user vulnerability/exposure profile → HTSI (personal)
 *
 * This module is the TRANSPARENT RULE-BASED methodology. It also generates
 * the prototype training labels for the Random Forest model layer
 * (label_source = "synthetic_rule"). These rules are prototype logic for a
 * hackathon demonstration — they are NOT medically validated and HTSI is
 * NOT a medical diagnosis.
 *
 * Design guarantees:
 *  - Identical environments produce identical UTCI for all users; only the
 *    profile terms below can make HTSI differ between users.
 *  - The environmental base of HTSI is a monotone function of UTCI only.
 *  - Every profile contribution is returned in `factors` so the UI can
 *    explain the score ("why is my risk HIGH?").
 */

const { riskLevelForScore } = require('../config/riskLevels');

/** Map UTCI (°C) to a 0–60 environmental base score (monotone, piecewise linear). */
function environmentalBase(utciC) {
  // Anchors follow the official UTCI heat-stress boundaries (26/32/38/46 °C).
  const anchors = [
    [9, 0],
    [26, 10],
    [32, 25],
    [38, 40],
    [46, 52],
    [55, 60],
  ];
  if (utciC <= anchors[0][0]) return 0;
  for (let i = 1; i < anchors.length; i += 1) {
    const [x1, y1] = anchors[i - 1];
    const [x2, y2] = anchors[i];
    if (utciC <= x2) return y1 + ((utciC - x1) / (x2 - x1)) * (y2 - y1);
  }
  return 60;
}

const CONTRIBUTIONS = {
  ageVulnerabilityFlag: { true: 8 },
  healthRiskCategory: { low: 0, moderate: 4, high: 8, very_high: 12 },
  exposureCategory: { low: 0, moderate: 4, high: 8, very_high: 11 },
  activityLevel: { light: 0, moderate: 3, heavy: 7, very_heavy: 9 },
  occupationalHeatExposure: { low: 0, moderate: 2, high: 5 },
  heatAcclimatization: { high: -4, moderate: -2, low: 0 },
  coolingAccess: { yes: -3, partial: -1, no: 2 },
  hydrationAccess: { yes: -2, partial: 0, no: 3 },
  shadeAccess: { yes: -2, partial: 0, no: 2 },
  protectiveClothing: { yes: -1, partial: 0, no: 1 },
  breakFrequency: { frequent: -2, occasional: 0, rare: 2 },
};

function norm(v) {
  return String(v == null ? '' : v).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Compute HTSI from UTCI plus a user vulnerability/exposure profile.
 *
 * The profile modifies HTSI ONLY — it never touches the UTCI input.
 *
 * @param {object} p
 * @param {number} p.utciC                       computed UTCI (°C) — required
 * @param {object} p.profile                     user vulnerability profile
 * @returns {{htsiScore:(number|null), riskLevel:(string|null),
 *            status:string, reason?:string,
 *            factors:Array<{factor:string,value:string,points:number}>}}
 */
function calculateHtsi({ utciC, profile }) {
  if (typeof utciC !== 'number' || !Number.isFinite(utciC)) {
    return {
      htsiScore: null,
      riskLevel: null,
      status: 'unavailable',
      reason: 'UTCI is unavailable, so a personalized HTSI cannot be calculated.',
      factors: [],
    };
  }
  if (!profile || typeof profile !== 'object') {
    return {
      htsiScore: null,
      riskLevel: null,
      status: 'unavailable',
      reason: 'User vulnerability profile is missing.',
      factors: [],
    };
  }

  const base = environmentalBase(utciC);
  const factors = [{ factor: 'utci_environmental_base', value: `${utciC} °C UTCI`, points: Math.round(base * 10) / 10 }];

  let profilePoints = 0;
  const add = (factor, rawValue, points) => {
    if (points === undefined || points === 0) return;
    profilePoints += points;
    factors.push({ factor, value: String(rawValue), points });
  };

  add('age_vulnerability', profile.ageVulnerabilityFlag ? 'age <5 or ≥65 (synthetic prototype rule)' : 'no', CONTRIBUTIONS.ageVulnerabilityFlag[String(!!profile.ageVulnerabilityFlag)]);
  add('health_risk_category', profile.healthRiskCategory, CONTRIBUTIONS.healthRiskCategory[norm(profile.healthRiskCategory)]);
  if (profile.multipleHealthConditions) add('multiple_health_conditions', 'yes', 3);
  add('exposure_category', profile.exposureCategory, CONTRIBUTIONS.exposureCategory[norm(profile.exposureCategory)]);
  add('activity_level', profile.activityLevel, CONTRIBUTIONS.activityLevel[norm(profile.activityLevel)]);
  add('occupational_heat_exposure', profile.occupationalHeatExposure, CONTRIBUTIONS.occupationalHeatExposure[norm(profile.occupationalHeatExposure)]);
  add('heat_acclimatization', profile.heatAcclimatization, CONTRIBUTIONS.heatAcclimatization[norm(profile.heatAcclimatization)]);
  add('cooling_access', profile.coolingAccess, CONTRIBUTIONS.coolingAccess[norm(profile.coolingAccess)]);
  add('hydration_access', profile.hydrationAccess, CONTRIBUTIONS.hydrationAccess[norm(profile.hydrationAccess)]);
  add('shade_access', profile.shadeAccess, CONTRIBUTIONS.shadeAccess[norm(profile.shadeAccess)]);
  add('protective_clothing', profile.protectiveClothing, CONTRIBUTIONS.protectiveClothing[norm(profile.protectiveClothing)]);
  add('break_frequency', profile.breakFrequency, CONTRIBUTIONS.breakFrequency[norm(profile.breakFrequency)]);

  if (isFinite(profile.outdoorExposureHours)) {
    const h = Number(profile.outdoorExposureHours);
    const pts = Math.min(6, Math.max(0, Math.round((h / 2) * 10) / 10));
    add('outdoor_exposure_hours', `${h} h/day`, pts);
  }

  // Profile terms scale with the environment: on a cool day even a highly
  // vulnerable profile should not produce a high heat risk.
  const envScale = Math.min(1, base / 25);
  let score = base + profilePoints * envScale;
  score = Math.max(0, Math.min(100, score));
  score = Math.round(score * 10) / 10;

  return { htsiScore: score, riskLevel: riskLevelForScore(score), status: 'calculated', factors };
}

module.exports = { calculateHtsi, environmentalBase, CONTRIBUTIONS };
