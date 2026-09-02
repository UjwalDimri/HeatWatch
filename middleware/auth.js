'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const COOKIE_NAME = 'heatwatch_token';

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '12h',
  });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

/** Attach req.user if a valid token is present (cookie for the web app,
 *  Authorization: Bearer for the mobile app); never throws. */
async function attachUser(req, res, next) {
  try {
    let token = req.cookies?.[COOKIE_NAME];
    const header = req.get('authorization');
    if (!token && header && header.startsWith('Bearer ')) token = header.slice(7);
    if (!token) return next();
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).lean();
    if (user) req.user = user;
  } catch (err) {
    // invalid/expired token → treated as logged out
  }
  return next();
}

/** Require a logged-in user. HTML routes redirect; API routes get 401 JSON. */
function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.path.startsWith('/api') || req.originalUrl.startsWith('/api')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  return res.redirect('/login');
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, attachUser, requireAuth, COOKIE_NAME };
