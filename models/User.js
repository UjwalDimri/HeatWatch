'use strict';
const mongoose = require('mongoose');

/** Registered application users (authentication). Synthetic profiles are
 *  NEVER stored here — they live in UserProfile with dataType "synthetic"
 *  and have no login credentials. */
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true }, // bcrypt hash — never plaintext
  role: { type: String, enum: ['citizen', 'government', 'admin'], default: 'citizen' },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: null },
});

module.exports = mongoose.model('User', userSchema);
