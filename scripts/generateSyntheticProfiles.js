'use strict';

/**
 * scripts/generateSyntheticProfiles.js
 *
 * Generates the SYNTHETIC user-vulnerability dataset
 * (data/raw/user_vulnerability.csv).
 *
 *   node scripts/generateSyntheticProfiles.js [count] [seed]
 *   npm run generate:synthetic                    → 100000 rows, seed 42
 *
 * ⚠ SYNTHETIC DATA. Every row is generated. This is NOT real patient or
 * survey data, it is NOT medically validated, and it exists only for
 * prototype development, testing, demonstration and synthetic training.
 * The dataset contains NO weather variables and NO PII (no email, phone,
 * password, Aadhaar or government IDs).
 *
 * Reproducibility: deterministic PRNG (mulberry32), default seed 42.
 *
 * Relationships encoded (synthetic prototype relationships — not medically
 * validated causal claims): occupation → occupation category → outdoor
 * exposure / activity / occupational heat exposure / acclimatization /
 * protection; age → age group → health condition → health risk category;
 * age <5 or ≥65 → age_vulnerability_flag (synthetic prototype rule).
 */

const fs = require('fs');
const path = require('path');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OCCUPATIONS = [
  { name: 'Construction Worker', category: 'outdoor_labour' },
  { name: 'Farmer', category: 'outdoor_labour' },
  { name: 'Street Vendor', category: 'outdoor_service' },
  { name: 'Traffic Police', category: 'outdoor_service' },
  { name: 'Delivery Rider', category: 'outdoor_service' },
  { name: 'Rickshaw Driver', category: 'outdoor_service' },
  { name: 'Factory Worker', category: 'indoor_industrial' },
  { name: 'Kitchen Staff', category: 'indoor_industrial' },
  { name: 'Shopkeeper', category: 'indoor_service' },
  { name: 'Teacher', category: 'indoor_service' },
  { name: 'Software Engineer', category: 'indoor_office' },
  { name: 'Bank Clerk', category: 'indoor_office' },
  { name: 'Homemaker', category: 'domestic' },
  { name: 'Student', category: 'domestic' },
  { name: 'Retired', category: 'domestic' },
];

const CATEGORY_TRAITS = {
  outdoor_labour: { exposure: [5, 10], activity: ['heavy', 'very_heavy'], occHeat: 'high', accl: 'high', protect: 0.35, shade: 0.3, breaks: 'rare' },
  outdoor_service: { exposure: [4, 9], activity: ['moderate', 'heavy'], occHeat: 'high', accl: 'high', protect: 0.4, shade: 0.4, breaks: 'occasional' },
  indoor_industrial: { exposure: [1, 3], activity: ['moderate', 'heavy'], occHeat: 'moderate', accl: 'moderate', protect: 0.6, shade: 0.8, breaks: 'occasional' },
  indoor_service: { exposure: [1, 3], activity: ['light', 'moderate'], occHeat: 'low', accl: 'moderate', protect: 0.7, shade: 0.85, breaks: 'frequent' },
  indoor_office: { exposure: [0, 2], activity: ['light'], occHeat: 'low', accl: 'low', protect: 0.8, shade: 0.95, breaks: 'frequent' },
  domestic: { exposure: [0, 4], activity: ['light', 'moderate'], occHeat: 'low', accl: 'moderate', protect: 0.6, shade: 0.7, breaks: 'frequent' },
};

const HEALTH_BY_AGE = {
  child: ['none', 'none', 'asthma'],
  young_adult: ['none', 'none', 'none', 'asthma'],
  adult: ['none', 'none', 'hypertension', 'diabetes', 'asthma'],
  middle_aged: ['none', 'hypertension', 'diabetes', 'heart_disease', 'kidney_disease'],
  senior: ['hypertension', 'diabetes', 'heart_disease', 'kidney_disease', 'copd', 'none'],
};

const HEALTH_RISK = {
  none: 'low',
  asthma: 'moderate',
  hypertension: 'moderate',
  diabetes: 'high',
  copd: 'high',
  heart_disease: 'very_high',
  kidney_disease: 'very_high',
};

const CITIES = [
  ['Agra', 'Uttar Pradesh'], ['Aligarh', 'Uttar Pradesh'], ['Lucknow', 'Uttar Pradesh'],
  ['Delhi', 'Delhi'], ['Jaipur', 'Rajasthan'], ['Jodhpur', 'Rajasthan'],
  ['Ahmedabad', 'Gujarat'], ['Nagpur', 'Maharashtra'], ['Hyderabad', 'Telangana'],
  ['Chennai', 'Tamil Nadu'], ['Bhubaneswar', 'Odisha'], ['Patna', 'Bihar'],
];

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function generate(count, seed) {
  const rand = mulberry32(seed);
  const rows = [];
  for (let i = 1; i <= count; i += 1) {
    // Age → age group
    const r = rand();
    let age;
    if (r < 0.08) age = Math.floor(rand() * 15); // 0–14
    else if (r < 0.85) age = 15 + Math.floor(rand() * 50); // 15–64
    else age = 65 + Math.floor(rand() * 25); // 65–89

    const ageGroup =
      age < 15 ? 'child' : age < 30 ? 'young_adult' : age < 45 ? 'adult' : age < 65 ? 'middle_aged' : 'senior';

    // Occupation depends loosely on age group
    let occ;
    if (ageGroup === 'child') occ = { name: 'Student', category: 'domestic' };
    else if (ageGroup === 'senior' && rand() < 0.6) occ = { name: 'Retired', category: 'domestic' };
    else occ = pick(rand, OCCUPATIONS);

    const t = CATEGORY_TRAITS[occ.category];
    const exposureHours = +(t.exposure[0] + rand() * (t.exposure[1] - t.exposure[0])).toFixed(1);
    const exposureCategory =
      exposureHours < 2 ? 'low' : exposureHours < 4 ? 'moderate' : exposureHours < 7 ? 'high' : 'very_high';
    const activityLevel = pick(rand, t.activity);

    const healthCondition = pick(rand, HEALTH_BY_AGE[ageGroup]);
    const healthRiskCategory = HEALTH_RISK[healthCondition];
    const multiple = healthCondition !== 'none' && rand() < (ageGroup === 'senior' ? 0.4 : 0.12);

    const [city, state] = pick(rand, CITIES);

    rows.push({
      user_id: `SYN-${String(i).padStart(6, '0')}`,
      age,
      age_group: ageGroup,
      occupation: occ.name,
      occupation_category: occ.category,
      outdoor_exposure_hours: exposureHours,
      exposure_category: exposureCategory,
      activity_level: activityLevel,
      health_condition: healthCondition,
      health_risk_category: healthRiskCategory,
      multiple_health_conditions: multiple,
      age_vulnerability_flag: age < 5 || age >= 65, // synthetic prototype rule
      occupational_heat_exposure: t.occHeat,
      heat_acclimatization: t.accl,
      cooling_access: rand() < 0.55 ? 'yes' : rand() < 0.5 ? 'partial' : 'no',
      hydration_access: rand() < 0.7 ? 'yes' : rand() < 0.5 ? 'partial' : 'no',
      protective_clothing: rand() < t.protect ? 'yes' : rand() < 0.5 ? 'partial' : 'no',
      shade_access: rand() < t.shade ? 'yes' : rand() < 0.5 ? 'partial' : 'no',
      break_frequency: t.breaks,
      city,
      state,
    });
  }
  return rows;
}

function toCsv(rows) {
  const cols = Object.keys(rows[0]);
  const esc = (v) => (typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

if (require.main === module) {
  const count = Number(process.argv[2]) || 100000;
  const seed = Number(process.argv[3]) || 42;
  const rows = generate(count, seed);
  const out = path.join(__dirname, '..', 'data', 'raw', 'user_vulnerability.csv');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, toCsv(rows));
  console.log(`SYNTHETIC dataset written: ${out}`);
  console.log(`rows=${rows.length} seed=${seed}`);
  console.log('Reminder: this data is synthetic — not real patient data, not medically validated.');
}

module.exports = { generate, mulberry32 };
