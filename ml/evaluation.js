'use strict';

/** Regression metrics for the HTSI model (MAE, RMSE, R²) plus a
 *  classification view (accuracy / per-class precision, recall, F1,
 *  confusion matrix) over the derived risk levels. */

const { riskLevelForScore, RISK_LEVELS } = require('../config/riskLevels');

function regressionMetrics(yTrue, yPred) {
  const nRows = yTrue.length;
  let sae = 0;
  let sse = 0;
  let mean = 0;
  for (const y of yTrue) mean += y / nRows;
  let sst = 0;
  for (let i = 0; i < nRows; i += 1) {
    const e = yTrue[i] - yPred[i];
    sae += Math.abs(e);
    sse += e * e;
    sst += (yTrue[i] - mean) ** 2;
  }
  return {
    n: nRows,
    mae: +(sae / nRows).toFixed(3),
    rmse: +Math.sqrt(sse / nRows).toFixed(3),
    r2: sst === 0 ? null : +(1 - sse / sst).toFixed(4),
  };
}

function classificationMetrics(yTrue, yPred) {
  const labels = RISK_LEVELS;
  const idx = Object.fromEntries(labels.map((l, i) => [l, i]));
  const cm = labels.map(() => labels.map(() => 0));
  let correct = 0;
  for (let i = 0; i < yTrue.length; i += 1) {
    const t = riskLevelForScore(yTrue[i]);
    const p = riskLevelForScore(yPred[i]);
    cm[idx[t]][idx[p]] += 1;
    if (t === p) correct += 1;
  }
  const perClass = labels.map((label, i) => {
    const tp = cm[i][i];
    const fp = cm.reduce((s, row, r) => s + (r === i ? 0 : row[i]), 0);
    const fn = cm[i].reduce((s, v, c) => s + (c === i ? 0 : v), 0);
    const precision = tp + fp === 0 ? null : +(tp / (tp + fp)).toFixed(3);
    const recall = tp + fn === 0 ? null : +(tp / (tp + fn)).toFixed(3);
    const f1 =
      precision === null || recall === null || precision + recall === 0
        ? null
        : +((2 * precision * recall) / (precision + recall)).toFixed(3);
    return { label, precision, recall, f1, support: tp + fn };
  });
  return {
    accuracy: +(correct / yTrue.length).toFixed(4),
    perClass,
    confusionMatrix: { labels, matrix: cm },
  };
}

module.exports = { regressionMetrics, classificationMetrics };
