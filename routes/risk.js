'use strict';

const express = require('express');
const UserProfile = require('../models/UserProfile');
const { runRiskPipeline } = require('../services/riskPipeline');
const { validCoordinates } = require('../services/canonical');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/risk  { latitude, longitude }
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { latitude, longitude } = req.body || {};
    if (!validCoordinates(latitude, longitude)) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
    }
    const profile = await UserProfile.findOne({ userId: req.user._id }).lean();
    if (!profile) {
      return res.status(422).json({
        error: 'No vulnerability profile found for this account, so a personalized HTSI cannot be calculated.',
      });
    }
    const result = await runRiskPipeline({
      latitude: Number(latitude),
      longitude: Number(longitude),
      user: req.user,
      profile,
    });
    return res.json(result);
  } catch (err) {
    if (err.code === 'SOURCE_UNAVAILABLE') {
      return res.status(503).json({
        error: err.message,
        dataStatus: 'unavailable',
        utciStatus: 'unavailable',
        riskStatus: 'unavailable',
      });
    }
    return next(err);
  }
});

// GET /api/risk/history — this user's stored predictions for charts
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const RiskPrediction = require('../models/RiskPrediction');
    const rows = await RiskPrediction.find({ userId: req.user._id })
      .sort({ timestamp: -1 })
      .limit(48)
      .lean();
    return res.json({ history: rows.reverse() });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
