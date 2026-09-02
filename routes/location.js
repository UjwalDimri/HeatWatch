'use strict';

const express = require('express');
const { searchLocation } = require('../services/nominatim');

const router = express.Router();

// GET /api/location/search?q=Agra  (Nominatim — geocoding only, optional)
router.get('/search', async (req, res, next) => {
  try {
    const results = await searchLocation(req.query.q);
    return res.json({ results });
  } catch (err) {
    if (err.code === 'BAD_INPUT') return res.status(400).json({ error: err.message });
    if (err.code && err.code.startsWith('SOURCE_')) {
      return res.status(503).json({ error: `Location search is currently unavailable: ${err.message}` });
    }
    return next(err);
  }
});

module.exports = router;
