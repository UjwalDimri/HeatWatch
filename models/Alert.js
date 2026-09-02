'use strict';
const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  timestamp: { type: Date, default: Date.now, index: true },
  latitude: Number,
  longitude: Number,
  severity: { type: String, enum: ['HIGH', 'VERY HIGH', 'EXTREME'], required: true },
  utci: Number,
  htsi: Number,
  message: { type: String, required: true },
  status: { type: String, enum: ['active', 'read'], default: 'active' },
  source: { type: String, enum: ['open_meteo', 'nasa_power', 'imd', 'synthetic_demo'], required: true },
});

module.exports = mongoose.model('Alert', alertSchema);
