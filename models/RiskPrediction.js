'use strict';
const mongoose = require('mongoose');

/** One stored run of the environment → UTCI → HTSI pipeline. */
const riskPredictionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  timestamp: { type: Date, required: true, index: true },
  latitude: Number,
  longitude: Number,
  source: { type: String, enum: ['open_meteo', 'nasa_power', 'imd', 'synthetic_demo'], required: true },

  temperature: Number,
  relativeHumidity: Number,
  windSpeed: Number,
  solarRadiation: Number,

  vapourPressure: Number,
  tmrt: Number,
  deltaTmrt: Number,
  utci: Number,
  utciCategory: String,

  htsi: Number,
  riskLevel: String,

  dataStatus: String,
  tmrtStatus: String,
  utciStatus: String,
  modelStatus: String,

  createdAt: { type: Date, default: Date.now },
});

riskPredictionSchema.index({ latitude: 1, longitude: 1, timestamp: -1 });

module.exports = mongoose.model('RiskPrediction', riskPredictionSchema);
