'use strict';

/**
 * scripts/seedUsers.js — import the synthetic profile CSV into MongoDB.
 *
 *   npm run seed:users [-- path/to/csv] [--limit N]
 *
 * Imports rows from data/raw/user_vulnerability.csv into the UserProfile
 * collection with dataType = "synthetic".
 *
 * Synthetic profiles are NOT authentication accounts: no passwords are
 * created for them and nothing is written to the users collection.
 * Duplicates (same user_id) are skipped. A summary of inserted / skipped /
 * errored rows is printed.
 *
 * Also creates three demo login accounts (citizen / government / admin)
 * unless --no-demo-accounts is passed, so the three dashboards can be
 * opened immediately. Demo passwords are read from env or default to
 * "heatwatch-demo" — change them for any real deployment.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { connectDatabase } = require('../config/database');

const REQUIRED_COLUMNS = [
  'user_id', 'age', 'age_group', 'occupation', 'occupation_category',
  'outdoor_exposure_hours', 'exposure_category', 'activity_level',
  'health_condition', 'health_risk_category', 'multiple_health_conditions',
  'age_vulnerability_flag', 'occupational_heat_exposure', 'heat_acclimatization',
  'cooling_access', 'hydration_access', 'protective_clothing', 'shade_access',
  'break_frequency', 'city', 'state',
];

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    // simple CSV: quoted fields may contain commas
    const cells = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

function toBool(v) {
  return String(v).toLowerCase() === 'true';
}

async function main() {
  const args = process.argv.slice(2);
  const csvArg = args.find((a) => !a.startsWith('--'));
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  const csvPath = csvArg || path.join(__dirname, '..', 'data', 'raw', 'user_vulnerability.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    console.error('Generate it first: npm run generate:synthetic');
    process.exit(1);
  }

  await connectDatabase();
  const UserProfile = require('../models/UserProfile');
  const User = require('../models/User');

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const missingCols = REQUIRED_COLUMNS.filter((c) => !(c in (rows[0] || {})));
  if (missingCols.length) {
    console.error(`CSV is missing required columns: ${missingCols.join(', ')}`);
    process.exit(1);
  }

  const existing = new Set(
    (await UserProfile.find({ dataType: 'synthetic' }, { syntheticId: 1 }).lean()).map((d) => d.syntheticId)
  );

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const batch = [];
  const flush = async () => {
    if (!batch.length) return;
    try {
      await UserProfile.insertMany(batch, { ordered: false });
      inserted += batch.length;
    } catch (err) {
      const ok = err.insertedDocs ? err.insertedDocs.length : 0;
      inserted += ok;
      errors += batch.length - ok;
    }
    batch.length = 0;
  };

  let processed = 0;
  for (const r of rows) {
    if (processed >= limit) break;
    processed += 1;
    if (!r.user_id || existing.has(r.user_id)) {
      skipped += 1;
      continue;
    }
    existing.add(r.user_id);
    const age = Number(r.age);
    const hours = Number(r.outdoor_exposure_hours);
    if (!Number.isFinite(age) || !Number.isFinite(hours)) {
      errors += 1;
      continue;
    }
    batch.push({
      syntheticId: r.user_id,
      age,
      ageGroup: r.age_group,
      occupation: r.occupation,
      occupationCategory: r.occupation_category,
      outdoorExposureHours: hours,
      exposureCategory: r.exposure_category,
      activityLevel: r.activity_level,
      healthCondition: r.health_condition,
      healthRiskCategory: r.health_risk_category,
      multipleHealthConditions: toBool(r.multiple_health_conditions),
      ageVulnerabilityFlag: toBool(r.age_vulnerability_flag),
      occupationalHeatExposure: r.occupational_heat_exposure,
      heatAcclimatization: r.heat_acclimatization,
      coolingAccess: r.cooling_access,
      hydrationAccess: r.hydration_access,
      protectiveClothing: r.protective_clothing,
      shadeAccess: r.shade_access,
      breakFrequency: r.break_frequency,
      city: r.city,
      state: r.state,
      dataType: 'synthetic',
    });
    if (batch.length >= 1000) await flush();
  }
  await flush();

  console.log(`Synthetic profile import complete: inserted=${inserted} skipped=${skipped} errors=${errors}`);

  if (!args.includes('--no-demo-accounts')) {
    const demoPassword = process.env.DEMO_PASSWORD || 'heatwatch-demo';
    const hash = await bcrypt.hash(demoPassword, 10);
    for (const [name, email, role] of [
      ['Demo Citizen', 'citizen@heatwatch.demo', 'citizen'],
      ['Demo Government', 'government@heatwatch.demo', 'government'],
      ['Demo Admin', 'admin@heatwatch.demo', 'admin'],
    ]) {
      const exists = await User.findOne({ email });
      if (!exists) {
        await User.create({ name, email, passwordHash: hash, role });
        console.log(`Created demo account ${email} (role ${role})`);
      }
    }
    console.log(`Demo password: ${demoPassword} (set DEMO_PASSWORD in .env to change)`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
