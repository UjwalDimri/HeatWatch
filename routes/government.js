'use strict';

const express = require('express');
const RiskPrediction = require('../models/RiskPrediction');
const Location = require('../models/Location');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { RISK_LEVELS } = require('../config/riskLevels');

const router = express.Router();
router.use(requireAuth, requireRole('government', 'admin'));

// GET /api/government/locations
router.get('/locations', async (req, res, next) => {
  try {
    const locations = await Location.find().lean();
    return res.json({ locations });
  } catch (err) {
    return next(err);
  }
});

// GET /api/government/risk-map — same payload as /api/map/risk-points
router.get('/risk-map', (req, res) => res.redirect(307, '/api/map/risk-points'));

// GET /api/government/statistics
router.get('/statistics', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 48 * 3600 * 1000);
    const latest = await RiskPrediction.aggregate([
      { $match: { createdAt: { $gte: since }, latitude: { $ne: null } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { lat: { $round: ['$latitude', 2] }, lon: { $round: ['$longitude', 2] } },
          riskLevel: { $first: '$riskLevel' },
          utci: { $first: '$utci' },
          state: { $first: '$dataStatus' },
        },
      },
    ]);
    const distribution = Object.fromEntries(RISK_LEVELS.map((l) => [l, 0]));
    let unavailable = 0;
    const utcis = [];
    for (const p of latest) {
      if (p.riskLevel && distribution[p.riskLevel] !== undefined) distribution[p.riskLevel] += 1;
      else unavailable += 1;
      if (typeof p.utci === 'number') utcis.push(p.utci);
    }
    const highPlus = distribution.HIGH + distribution['VERY HIGH'] + distribution.EXTREME;
    return res.json({
      totalMonitoredLocations: latest.length,
      riskDistribution: distribution,
      unavailable,
      highRiskLocations: distribution.HIGH,
      veryHighRiskLocations: distribution['VERY HIGH'],
      extremeRiskLocations: distribution.EXTREME,
      highOrAboveLocations: highPlus,
      utci: utcis.length
        ? {
            min: Math.min(...utcis),
            max: Math.max(...utcis),
            mean: +(utcis.reduce((a, b) => a + b, 0) / utcis.length).toFixed(1),
          }
        : null,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
