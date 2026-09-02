'use strict';
/**
 * Database-backed tests: MongoDB connection, signup, login, logout, auth,
 * authorization, risk endpoint (mocked weather), map endpoint, alert
 * generation. Skipped automatically when MongoDB is not reachable so the
 * calculation suite still runs anywhere.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/heatwatch_test';

const mongoose = require('mongoose');
let available = false;
let server;
let baseUrl;

before(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 1500 });
    await mongoose.connection.dropDatabase();
    available = true;
  } catch (err) {
    console.log(`# MongoDB not reachable (${err.message}) — skipping DB tests.`);
    return;
  }
  // mark app-level connection as up
  const db = require('../config/database');
  await db.connectDatabase().catch(() => {});
  const app = require('../app');
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) server.close();
  if (available) await mongoose.connection.close();
});

function jar() {
  let cookie = '';
  return {
    async fetch(path, opts = {}) {
      const res = await fetch(baseUrl + path, {
        ...opts,
        headers: { 'Content-Type': 'application/json', cookie, ...(opts.headers || {}) },
        redirect: 'manual',
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return res;
    },
  };
}

const signupBody = {
  name: 'Test Citizen', email: 'cit@test.dev', password: 'password123', age: 68,
  occupation: 'Construction Worker', occupationCategory: 'outdoor_labour',
  healthRiskCategory: 'moderate', healthCondition: 'hypertension',
  outdoorExposureHours: 7, exposureCategory: 'very_high', activityLevel: 'heavy',
  occupationalHeatExposure: 'high', heatAcclimatization: 'high',
  coolingAccess: 'no', hydrationAccess: 'partial', protectiveClothing: 'partial',
  shadeAccess: 'no', breakFrequency: 'rare', city: 'Agra', state: 'UP',
  latitude: 27.18, longitude: 78.01,
};

test('signup creates user + profile and logs in', { skip: () => !available }, async (t) => {
  if (!available) return t.skip();
  const c = jar();
  const res = await c.fetch('/api/auth/signup', { method: 'POST', body: JSON.stringify(signupBody) });
  assert.equal(res.status, 201);
  const me = await c.fetch('/api/auth/me');
  const body = await me.json();
  assert.equal(body.user.role, 'citizen');
  assert.equal(body.profile.exposureCategory, 'very_high');
  assert.equal(body.profile.ageVulnerabilityFlag, true); // age 68 → flag (prototype rule)
});

test('duplicate signup and bad login are rejected', { skip: () => !available }, async (t) => {
  if (!available) return t.skip();
  const c = jar();
  const dup = await c.fetch('/api/auth/signup', { method: 'POST', body: JSON.stringify(signupBody) });
  assert.equal(dup.status, 400);
  const bad = await c.fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: signupBody.email, password: 'wrong-password' }) });
  assert.equal(bad.status, 401);
});

test('passwords are stored hashed, never plaintext', { skip: () => !available }, async (t) => {
  if (!available) return t.skip();
  const User = require('../models/User');
  const u = await User.findOne({ email: signupBody.email }).lean();
  assert.ok(u.passwordHash.startsWith('$2'), 'bcrypt hash expected');
  assert.notEqual(u.passwordHash, signupBody.password);
});

test('role authorization: citizen blocked from admin & government APIs', { skip: () => !available }, async (t) => {
  if (!available) return t.skip();
  const c = jar();
  await c.fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: signupBody.email, password: signupBody.password }) });
  assert.equal((await c.fetch('/api/admin/statistics')).status, 403);
  assert.equal((await c.fetch('/api/map/risk-points')).status, 403);
});

test('unauthenticated /api/risk → 401; authorized risk flow works end-to-end with mocked weather', { skip: () => !available }, async (t) => {
  if (!available) return t.skip();
  const anon = jar();
  assert.equal((await anon.fetch('/api/risk', { method: 'POST', body: JSON.stringify({ latitude: 27, longitude: 78 }) })).status, 401);

  // Mock Open-Meteo with an extreme-heat hour so an alert is generated.
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).includes('api.open-meteo.com')) {
      return {
        ok: true,
        json: async () => ({
          latitude: 27.18, longitude: 78.01,
          hourly: {
            time: [new Date().toISOString().slice(0, 13) + ':00'],
            temperature_2m: [44], relative_humidity_2m: [30], wind_speed_10m: [1.0],
            cloud_cover: [0], shortwave_radiation: [900], direct_radiation: [700],
            diffuse_radiation: [200], direct_normal_irradiance: [850],
          },
        }),
      };
    }
    return realFetch(url, opts);
  };
  t.after(() => { global.fetch = realFetch; });

  const c = jar();
  await c.fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: signupBody.email, password: signupBody.password }) });
  const res = await c.fetch('/api/risk', { method: 'POST', body: JSON.stringify({ latitude: 27.18, longitude: 78.01 }) });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.source, 'open_meteo');
  assert.equal(body.utciStatus, 'calculated');
  assert.ok(body.utci > 38, `expected severe UTCI, got ${body.utci}`);
  assert.ok(body.htsi !== null && body.riskLevel, 'personalized HTSI expected');
  assert.ok(body.alert, 'high risk should generate an alert');

  const alerts = await (await c.fetch('/api/alerts')).json();
  assert.ok(alerts.alerts.length >= 1, 'alert stored and retrievable');

  const bad = await c.fetch('/api/risk', { method: 'POST', body: JSON.stringify({ latitude: 999, longitude: 78 }) });
  assert.equal(bad.status, 400); // invalid coordinates
});

test('logout clears the session', { skip: () => !available }, async (t) => {
  if (!available) return t.skip();
  const c = jar();
  await c.fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: signupBody.email, password: signupBody.password }) });
  await c.fetch('/api/auth/logout', { method: 'POST' });
  assert.equal((await c.fetch('/api/auth/me')).status, 401);
});
