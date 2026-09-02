'use strict';

/**
 * APPLICATION risk levels used for the personalized HTSI layer and alerts.
 *
 * These are HeatWatch product categories. They are deliberately kept separate
 * from the official UTCI thermal-stress categories (see
 * calculations/utciCategory.js) and must never be presented as UTCI
 * categories.
 */

const RISK_LEVELS = ['LOW', 'MODERATE', 'HIGH', 'VERY HIGH', 'EXTREME'];

// HTSI score (0–100) → application risk level.
const HTSI_THRESHOLDS = [
  { max: 20, level: 'LOW' },
  { max: 40, level: 'MODERATE' },
  { max: 60, level: 'HIGH' },
  { max: 80, level: 'VERY HIGH' },
  { max: Infinity, level: 'EXTREME' },
];

const RISK_COLORS = {
  LOW: '#2f9e73',
  MODERATE: '#d8a916',
  HIGH: '#e07020',
  'VERY HIGH': '#cf3f2e',
  EXTREME: '#7a1f6b',
};

// Alert is generated when the personalized risk reaches this level or above.
const ALERT_MIN_LEVEL = 'HIGH';

function riskLevelForScore(htsiScore) {
  if (typeof htsiScore !== 'number' || !Number.isFinite(htsiScore)) return null;
  for (const t of HTSI_THRESHOLDS) {
    if (htsiScore <= t.max) return t.level;
  }
  return 'EXTREME';
}

function riskRank(level) {
  return RISK_LEVELS.indexOf(level);
}

module.exports = { RISK_LEVELS, HTSI_THRESHOLDS, RISK_COLORS, ALERT_MIN_LEVEL, riskLevelForScore, riskRank };
