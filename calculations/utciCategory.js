'use strict';

/**
 * calculations/utciCategory.js
 *
 * Official UTCI thermal-stress assessment scale, taken from the same
 * validated implementation the polynomial was ported from (pythermalcomfort
 * `utci`, which follows the standard UTCI stress-category thresholds).
 * These thresholds are NOT invented; they are the standard scale.
 *
 * The numerical UTCI value and its category are kept separate, and this
 * scientific scale is kept separate from the HeatWatch application risk
 * levels in config/riskLevels.js.
 */

const UTCI_CATEGORIES = [
  { max: -40.0, label: 'extreme cold stress' },
  { max: -27.0, label: 'very strong cold stress' },
  { max: -13.0, label: 'strong cold stress' },
  { max: 0.0, label: 'moderate cold stress' },
  { max: 9.0, label: 'slight cold stress' },
  { max: 26.0, label: 'no thermal stress' },
  { max: 32.0, label: 'moderate heat stress' },
  { max: 38.0, label: 'strong heat stress' },
  { max: 46.0, label: 'very strong heat stress' },
  { max: Infinity, label: 'extreme heat stress' },
];

/**
 * @param {number|null} utciC
 * @returns {string|null} official UTCI stress category, or null if UTCI unavailable
 */
function classifyUtci(utciC) {
  if (typeof utciC !== 'number' || !Number.isFinite(utciC)) return null;
  for (const c of UTCI_CATEGORIES) {
    if (utciC < c.max || (c.max === Infinity && utciC >= 46.0)) return c.label;
  }
  return 'extreme heat stress';
}

module.exports = { classifyUtci, UTCI_CATEGORIES };
