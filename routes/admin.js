'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const RiskPrediction = require('../models/RiskPrediction');
const Alert = require('../models/Alert');
const LogEntry = require('../models/LogEntry');
const openMeteo = require('../services/openMeteo');
const nasaPower = require('../services/nasaPower');
const imd = require('../services/imd');
const nominatim = require('../services/nominatim');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { loadMetadata, loadMetrics } = require('../ml/modelMetadata');
const { getModelInfo } = require('../ml/predict');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// GET /api/admin/statistics
router.get('/statistics', async (req, res, next) => {
  try {
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const [totalUsers, activeUsers, totalPredictions, totalAlerts, syntheticProfiles, userProfiles] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ lastLogin: { $gte: dayAgo } }),
        RiskPrediction.countDocuments(),
        Alert.countDocuments(),
        UserProfile.countDocuments({ dataType: 'synthetic' }),
        UserProfile.countDocuments({ dataType: 'user' }),
      ]);
    const dataDir = path.join(__dirname, '..', 'data', 'processed');
    const fileInfo = (f) => {
      const p = path.join(dataDir, f);
      if (!fs.existsSync(p)) return { present: false };
      const st = fs.statSync(p);
      return { present: true, bytes: st.size, modified: st.mtime };
    };
    return res.json({
      totalUsers,
      activeUsers,
      totalPredictions,
      totalAlerts,
      profiles: { user: userProfiles, synthetic: syntheticProfiles },
      dataFiles: {
        weather_data: fileInfo('weather_data.csv'),
        utci_data: fileInfo('utci_data.csv'),
        htsi_training_data: fileInfo('htsi_training_data.csv'),
      },
      model: { metadata: loadMetadata(), metrics: loadMetrics(), runtime: getModelInfo() },
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/admin/users
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({}, { passwordHash: 0 }).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ users });
  } catch (err) {
    return next(err);
  }
});

// GET /api/admin/api-status — REAL probes, nothing hard-coded.
router.get('/api-status', async (req, res, next) => {
  try {
    const [om, np, im, no] = await Promise.all([
      openMeteo.probe(),
      nasaPower.probe(),
      imd.probe(),
      nominatim.probe(),
    ]);
    return res.json({ openMeteo: om, nasaPower: np, imd: im, nominatim: no });
  } catch (err) {
    return next(err);
  }
});

// GET /api/admin/logs
router.get('/logs', async (req, res, next) => {
  try {
    const logs = await LogEntry.find().sort({ timestamp: -1 }).limit(100).lean();
    return res.json({ logs });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
