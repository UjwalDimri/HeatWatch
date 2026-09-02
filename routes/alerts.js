'use strict';

const express = require('express');
const Alert = require('../models/Alert');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/alerts — current user's alerts (gov/admin see recent global alerts)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const filter = ['government', 'admin'].includes(req.user.role) ? {} : { userId: req.user._id };
    const alerts = await Alert.find(filter).sort({ timestamp: -1 }).limit(30).lean();
    return res.json({ alerts });
  } catch (err) {
    return next(err);
  }
});

// POST /api/alerts/read  { alertId } — mark one (or all of mine) read
router.post('/read', requireAuth, async (req, res, next) => {
  try {
    const { alertId } = req.body || {};
    if (alertId) {
      await Alert.updateOne({ _id: alertId, userId: req.user._id }, { $set: { status: 'read' } });
    } else {
      await Alert.updateMany({ userId: req.user._id, status: 'active' }, { $set: { status: 'read' } });
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
