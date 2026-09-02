'use strict';

const express = require('express');
const UserProfile = require('../models/UserProfile');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { RISK_COLORS } = require('../config/riskLevels');

const router = express.Router();

router.get('/', (req, res) => res.render('index', { user: req.user || null }));
router.get('/login', (req, res) =>
  req.user ? res.redirect('/dashboard') : res.render('login', { user: null })
);
router.get('/signup', (req, res) =>
  req.user ? res.redirect('/dashboard') : res.render('signup', { user: null })
);

router.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user._id }).lean();
    return res.render('dashboard', { user: req.user, profile, riskColors: RISK_COLORS });
  } catch (err) {
    return next(err);
  }
});

router.get('/government', requireAuth, requireRole('government', 'admin'), (req, res) =>
  res.render('government', { user: req.user, riskColors: RISK_COLORS })
);

router.get('/admin', requireAuth, requireRole('admin'), (req, res) =>
  res.render('admin', { user: req.user })
);

module.exports = router;
