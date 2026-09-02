'use strict';
const mongoose = require('mongoose');

/** Operational logs shown on the admin dashboard. */
const logEntrySchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
  category: {
    type: String,
    enum: ['api_failure', 'fallback', 'calculation', 'auth', 'system'],
    required: true,
  },
  message: { type: String, required: true },
  meta: { type: Object, default: {} },
});

module.exports = mongoose.model('LogEntry', logEntrySchema);
