'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { classifyUtci } = require('../calculations/utciCategory');

test('official UTCI stress categories', () => {
  assert.equal(classifyUtci(20), 'no thermal stress');
  assert.equal(classifyUtci(28), 'moderate heat stress');
  assert.equal(classifyUtci(35), 'strong heat stress');
  assert.equal(classifyUtci(40), 'very strong heat stress');
  assert.equal(classifyUtci(48), 'extreme heat stress');
  assert.equal(classifyUtci(-30), 'very strong cold stress');
});

test('category is null when UTCI is unavailable', () => {
  assert.equal(classifyUtci(null), null);
});
