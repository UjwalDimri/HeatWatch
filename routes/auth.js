'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const { signToken, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const { logEvent } = require('../services/logger');

const router = express.Router();

function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

// POST /api/auth/signup — creates the user AND their vulnerability profile.
router.post('/signup', async (req, res, next) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const age = Number(b.age);

    if (name.length < 2) return badRequest(res, 'Name must be at least 2 characters.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest(res, 'A valid email is required.');
    if (password.length < 8) return badRequest(res, 'Password must be at least 8 characters.');
    if (!Number.isFinite(age) || age < 0 || age > 120) return badRequest(res, 'Age must be between 0 and 120.');

    const exists = await User.findOne({ email });
    if (exists) return badRequest(res, 'An account with this email already exists.');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, role: 'citizen' });

    const lat = Number(b.latitude);
    const lon = Number(b.longitude);
    await UserProfile.create({
      userId: user._id,
      age,
      ageGroup: age < 15 ? 'child' : age < 30 ? 'young_adult' : age < 45 ? 'adult' : age < 65 ? 'middle_aged' : 'senior',
      occupation: String(b.occupation || '').trim(),
      occupationCategory: String(b.occupationCategory || '').trim(),
      healthRiskCategory: String(b.healthRiskCategory || 'low'),
      healthCondition: String(b.healthCondition || 'none'),
      multipleHealthConditions: b.multipleHealthConditions === 'yes' || b.multipleHealthConditions === true,
      ageVulnerabilityFlag: age < 5 || age >= 65, // synthetic prototype rule (documented)
      outdoorExposureHours: Number.isFinite(Number(b.outdoorExposureHours)) ? Number(b.outdoorExposureHours) : null,
      exposureCategory: String(b.exposureCategory || ''),
      activityLevel: String(b.activityLevel || ''),
      occupationalHeatExposure: String(b.occupationalHeatExposure || ''),
      heatAcclimatization: String(b.heatAcclimatization || ''),
      coolingAccess: String(b.coolingAccess || ''),
      hydrationAccess: String(b.hydrationAccess || ''),
      protectiveClothing: String(b.protectiveClothing || ''),
      shadeAccess: String(b.shadeAccess || ''),
      breakFrequency: String(b.breakFrequency || ''),
      city: String(b.city || ''),
      state: String(b.state || ''),
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lon) ? lon : null,
      dataType: 'user',
    });

    await logEvent('info', 'auth', `New signup: ${email}`);
    const token = signToken(user);
    setAuthCookie(res, token);
    return res.status(201).json({ ok: true, redirect: '/dashboard' });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      await logEvent('warn', 'auth', `Failed login for ${email || '(empty email)'}`);
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    user.lastLogin = new Date();
    await user.save();
    await logEvent('info', 'auth', `Login: ${email}`);
    setAuthCookie(res, signToken(user));
    const redirect = user.role === 'admin' ? '/admin' : user.role === 'government' ? '/government' : '/dashboard';
    return res.json({ ok: true, redirect });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true, redirect: '/' });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in.' });
  const profile = await UserProfile.findOne({ userId: req.user._id }).lean();
  return res.json({
    user: { name: req.user.name, email: req.user.email, role: req.user.role },
    profile,
  });
});

module.exports = router;
