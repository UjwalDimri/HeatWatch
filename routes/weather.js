'use strict';

const express = require('express');
const openMeteo = require('../services/openMeteo');
const imd = require('../services/imd');
const { validCoordinates } = require('../services/canonical');
const { logEvent } = require('../services/logger');

const router = express.Router();

// GET /api/weather?latitude=&longitude=
router.get('/', async (req, res, next) => {
  try {
    const { latitude, longitude } = req.query;
    if (!validCoordinates(latitude, longitude)) {
      return res.status(400).json({ error: 'Valid latitude (−90..90) and longitude (−180..180) are required.' });
    }
    try {
      const { record } = await openMeteo.fetchLive(Number(latitude), Number(longitude));
      return res.json({ dataStatus: record.dataStatus, record });
    } catch (primaryErr) {
      await logEvent('warn', 'api_failure', `Open-Meteo failed on /api/weather: ${primaryErr.message}`);
      try {
        const record = await imd.fetchLive(Number(latitude), Number(longitude));
        record.dataStatus = 'fallback';
        await logEvent('info', 'fallback', 'IMD fallback used on /api/weather');
        return res.json({ dataStatus: 'fallback', record });
      } catch (fallbackErr) {
        return res.status(503).json({
          dataStatus: 'unavailable',
          error: 'Live weather is currently unavailable from all configured sources — no data is being fabricated.',
          detail: { openMeteo: primaryErr.message, imd: fallbackErr.message },
        });
      }
    }
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
