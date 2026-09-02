'use strict';

const { logEvent } = require('../services/logger');

/** 404 for unknown routes. */
function notFound(req, res) {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  return res.status(404).render('error', {
    user: req.user || null,
    title: 'Page not found',
    message: 'The page you asked for does not exist.',
  });
}

/** Centralized error handler. Never returns fake data — always an explicit error. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status =
    err.status ||
    (err.code === 'BAD_INPUT' ? 400 : err.code && String(err.code).startsWith('SOURCE_') ? 502 : 500);

  logEvent('error', 'system', err.message, { path: req.originalUrl, code: err.code || null }).catch(() => {});

  if (req.originalUrl.startsWith('/api')) {
    return res.status(status).json({ error: err.message, code: err.code || 'INTERNAL_ERROR' });
  }
  return res.status(status).render('error', {
    user: req.user || null,
    title: 'Something went wrong',
    message: err.message,
  });
}

module.exports = { notFound, errorHandler };
