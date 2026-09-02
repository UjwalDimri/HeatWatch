'use strict';

/** Role-based authorization middleware. */
function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      if (req.originalUrl.startsWith('/api')) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      return res.redirect('/login');
    }
    if (!roles.includes(req.user.role)) {
      if (req.originalUrl.startsWith('/api')) {
        return res.status(403).json({ error: 'You do not have permission to access this resource.' });
      }
      return res.status(403).render('error', {
        user: req.user,
        title: 'Access denied',
        message: `Your role (${req.user.role}) does not have access to this page.`,
      });
    }
    return next();
  };
}

module.exports = { requireRole };
