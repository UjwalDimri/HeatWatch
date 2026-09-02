'use strict';

const express = require('express');
const RiskPrediction = require('../models/RiskPrediction');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

/**
 * GET /api/map/risk-points — latest stored prediction per rounded location.
 * Points originate ONLY from stored prediction records; records created by
 * demo seeding carry source = "synthetic_demo" and are labelled as such.
 */
router.get('/risk-points', requireAuth, requireRole('government', 'admin'), async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 48 * 3600 * 1000);
    const rows = await RiskPrediction.aggregate([
      { $match: { createdAt: { $gte: since }, latitude: { $ne: null } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            lat: { $round: ['$latitude', 2] },
            lon: { $round: ['$longitude', 2] },
          },
          doc: { $first: '$$ROOT' },
        },
      },
      { $limit: 500 },
    ]);
    const points = rows.map(({ doc }) => ({
      latitude: doc.latitude,
      longitude: doc.longitude,
      htsi_score: doc.htsi,
      risk_level: doc.riskLevel,
      utci_c: doc.utci,
      utci_category: doc.utciCategory,
      temperature_c: doc.temperature,
      relative_humidity_percent: doc.relativeHumidity,
      wind_speed_10m_ms: doc.windSpeed,
      solar_radiation_wm2: doc.solarRadiation,
      tmrt_c: doc.tmrt,
      source: doc.source,
      data_status: doc.dataStatus,
      timestamp: doc.timestamp,
    }));
    return res.json({ timestamp: new Date().toISOString(), points });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
