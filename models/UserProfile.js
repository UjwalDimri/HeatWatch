'use strict';
const mongoose = require('mongoose');

/**
 * Vulnerability/exposure profiles. Two kinds of records share this shape:
 *   dataType "user"      — profile of a real registered user (userId set)
 *   dataType "synthetic" — imported synthetic prototype profile (no login,
 *                          no PII, not real patient data)
 * Profiles contain NO weather variables and NO PII beyond what the user
 * enters at signup — environmental data lives in RiskPrediction.
 */
const userProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  syntheticId: { type: String, default: null, index: true }, // original user_id from CSV

  age: Number,
  ageGroup: String,

  occupation: String,
  occupationCategory: String,

  healthRiskCategory: String,
  healthCondition: String,
  multipleHealthConditions: Boolean,
  ageVulnerabilityFlag: Boolean,

  outdoorExposureHours: Number,
  exposureCategory: String,
  activityLevel: String,
  occupationalHeatExposure: String,
  heatAcclimatization: String,

  coolingAccess: String,
  hydrationAccess: String,
  protectiveClothing: String,
  shadeAccess: String,
  breakFrequency: String,

  city: String,
  state: String,
  latitude: Number,
  longitude: Number,

  dataType: { type: String, enum: ['user', 'synthetic'], required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('UserProfile', userProfileSchema);
