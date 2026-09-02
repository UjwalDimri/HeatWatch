'use strict';

/** Persist operational events for the admin dashboard; degrade to console
 *  if MongoDB is unavailable (never crash the request because of logging). */

const { isConnected } = require('../config/database');

async function logEvent(level, category, message, meta = {}) {
  // Passwords must never reach the logs.
  if (meta && typeof meta === 'object') {
    delete meta.password;
    delete meta.passwordHash;
  }
  if (!isConnected()) {
    console[level === 'error' ? 'error' : 'log'](`[${category}] ${message}`);
    return;
  }
  try {
    const LogEntry = require('../models/LogEntry');
    await LogEntry.create({ level, category, message, meta });
  } catch (err) {
    console.error(`[logger] failed to persist log: ${err.message}`);
  }
}

module.exports = { logEvent };
