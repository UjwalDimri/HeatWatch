'use strict';
const mongoose = require('mongoose');

/** Named monitored locations (used by the government dashboard demo seeding). */
const locationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  state: String,
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Location', locationSchema);
