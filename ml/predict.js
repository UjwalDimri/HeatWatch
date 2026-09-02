'use strict';

/**
 * ml/predict.js — the prediction interface `predictHtsi(features)` used by
 * the live pipeline.
 *
 * If a trained Random Forest model exists in model_store/, it is loaded
 * once and used. If no model has been trained yet, prediction reports
 * status "unavailable" and the pipeline transparently falls back to the
 * rule engine (calculations/htsi.js) — the same rules that generated the
 * model's training labels (label_source = "synthetic_rule").
 *
 * The ML layer NEVER computes UTCI — UTCI arrives pre-computed in the
 * feature vector from the deterministic scientific layer.
 */

const fs = require('fs');
const { buildFeatureVector, FEATURE_NAMES } = require('./features');
const { MODEL_PATH, loadMetadata } = require('./modelMetadata');
const { riskLevelForScore } = require('../config/riskLevels');
const { calculateHtsi } = require('../calculations/htsi');

let loaded = null; // { forest, metadata } | 'missing'

function ensureLoaded() {
  if (loaded) return loaded;
  try {
    if (!fs.existsSync(MODEL_PATH)) {
      loaded = 'missing';
      return loaded;
    }
    const { RandomForestRegression } = require('ml-random-forest');
    const modelJson = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
    const forest = RandomForestRegression.load(modelJson);
    const metadata = loadMetadata();
    if (metadata && Array.isArray(metadata.features)) {
      const same =
        metadata.features.length === FEATURE_NAMES.length &&
        metadata.features.every((f, i) => f === FEATURE_NAMES[i]);
      if (!same) {
        console.warn('[ml/predict] Stored model feature list differs from current features — model disabled.');
        loaded = 'missing';
        return loaded;
      }
    }
    loaded = { forest, metadata };
  } catch (err) {
    console.warn(`[ml/predict] Could not load HTSI model: ${err.message}`);
    loaded = 'missing';
  }
  return loaded;
}

function getModelInfo() {
  const meta = loadMetadata();
  const state = ensureLoaded();
  return {
    modelAvailable: state !== 'missing',
    modelType: meta?.modelType || null,
    modelVersion: meta?.modelVersion || null,
    trainedAt: meta?.trainingDate || null,
    labelSource: meta?.labelSource || null,
  };
}

/**
 * predictHTSI(features) — spec-required interface.
 * @param {object} p { record: enriched canonical record, profile }
 */
function predictHtsi({ record, profile }) {
  if (record.utciC === null || record.utciC === undefined) {
    return { htsiScore: null, riskLevel: null, status: 'unavailable', reason: 'UTCI unavailable.' };
  }
  const state = ensureLoaded();
  if (state === 'missing') {
    return { htsiScore: null, riskLevel: null, status: 'unavailable', reason: 'No trained model — rule engine will be used.' };
  }
  try {
    const x = buildFeatureVector(record, profile);
    const [raw] = state.forest.predict([x]);
    const score = Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10;
    // Explanations always come from the transparent rule engine so users can
    // see WHY, regardless of which layer produced the number.
    const ruled = calculateHtsi({ utciC: record.utciC, profile });
    return {
      htsiScore: score,
      riskLevel: riskLevelForScore(score),
      status: 'calculated',
      method: 'random_forest',
      factors: ruled.factors,
    };
  } catch (err) {
    return { htsiScore: null, riskLevel: null, status: 'unavailable', reason: `Model prediction failed: ${err.message}` };
  }
}

/** Test hook: force re-load of the model artifacts. */
function _resetModelCache() {
  loaded = null;
}

module.exports = { predictHtsi, getModelInfo, _resetModelCache };
