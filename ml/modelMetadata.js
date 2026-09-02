'use strict';

const fs = require('fs');
const path = require('path');

const MODEL_DIR = path.join(__dirname, '..', 'model_store');
const MODEL_PATH = path.join(MODEL_DIR, 'htsi_model.json');
const METADATA_PATH = path.join(MODEL_DIR, 'model_metadata.json');
const METRICS_PATH = path.join(MODEL_DIR, 'model_metrics.json');

function readJsonIfExists(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    return null;
  }
}

function loadMetadata() {
  return readJsonIfExists(METADATA_PATH);
}
function loadMetrics() {
  return readJsonIfExists(METRICS_PATH);
}

/** Versioning: never silently overwrite — previous model files are moved to
 *  a version-stamped archive before a new version is written. */
function archiveExistingModel() {
  const meta = loadMetadata();
  if (!meta || !fs.existsSync(MODEL_PATH)) return null;
  const dir = path.join(MODEL_DIR, `v${meta.modelVersion}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['htsi_model.json', 'model_metadata.json', 'model_metrics.json']) {
    const src = path.join(MODEL_DIR, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f));
  }
  return dir;
}

function saveModelArtifacts({ modelJson, metadata, metrics }) {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  archiveExistingModel();
  fs.writeFileSync(MODEL_PATH, JSON.stringify(modelJson));
  fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));
  fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2));
}

module.exports = {
  MODEL_DIR,
  MODEL_PATH,
  METADATA_PATH,
  METRICS_PATH,
  loadMetadata,
  loadMetrics,
  saveModelArtifacts,
  archiveExistingModel,
};
