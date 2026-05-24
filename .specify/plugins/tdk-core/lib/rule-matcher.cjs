'use strict';

const { minimatch } = require('./vendored/minimatch.cjs');

const MINIMATCH_OPTIONS = { dot: true, matchBase: false };

function normalizePath(filePath) {
  let p = filePath.replace(/\\/g, '/');
  if (p.startsWith('./')) p = p.slice(2);
  return p;
}

function matchFileAgainstGlobs(filePath, patterns) {
  if (!patterns || patterns.length === 0) return false;

  const normalized = normalizePath(filePath);
  let matched = false;

  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      if (minimatch(normalized, pattern.slice(1), MINIMATCH_OPTIONS)) return false;
    } else {
      if (minimatch(normalized, pattern, MINIMATCH_OPTIONS)) matched = true;
    }
  }

  return matched;
}

function createRuleMatcher(patterns) {
  return { match: (filePath) => matchFileAgainstGlobs(filePath, patterns) };
}

module.exports = { matchFileAgainstGlobs, createRuleMatcher };
