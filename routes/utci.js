'use strict';

const express = require('express');
const { runThermalPipeline } = require('../services/thermalPipeline');
const { makeCanonicalRecord, validCoordinates } = require('../services/canonical');

const router = express.Router();

/**
 * POST /api/utci — compute vapour pressure, Tmrt, ΔTmrt, UTCI and category
 * from a caller-supplied canonical environmental record (useful for
 * validation and testing). Nothing is fetched or invented here.
 */
router.post('/', (req, res, next) => {
  try {
    const b = req.body || {};
    if (!validCoordinates(b.latitude, b.longitude)) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
    }
    if (!b.timestamp) return res.status(400).json({ error: 'timestamp is required.' });
    const source = b.source || 'synthetic_demo';
    const record = makeCanonicalRecord({ ...b, source });
    const enriched = runThermalPipeline(record);
    return res.json({
      vapourPressureKpa: enriched.vapourPressureKpa,
      tmrtC: enriched.tmrtC,
      deltaTmrtC: enriched.deltaTmrtC,
      utciC: enriched.utciC,
      utciCategory: enriched.utciCategory,
      tmrtStatus: enriched.tmrtStatus,
      utciStatus: enriched.utciStatus,
      notes: enriched.pipelineNotes,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
