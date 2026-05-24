'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { matchFileAgainstGlobs, createRuleMatcher } = require('../lib/rule-matcher.cjs');

describe('matchFileAgainstGlobs', () => {
  it('matches file against glob pattern', () => {
    assert.equal(matchFileAgainstGlobs('src/parser.ts', ['src/**/*.ts']), true);
  });

  it('rejects non-matching file', () => {
    assert.equal(matchFileAgainstGlobs('README.md', ['src/**/*.ts']), false);
  });

  it('negation pattern excludes matched file', () => {
    assert.equal(
      matchFileAgainstGlobs('src/parser.test.ts', ['src/**/*.ts', '!src/**/*.test.ts']),
      false
    );
  });

  it('negation does not exclude non-negated file', () => {
    assert.equal(
      matchFileAgainstGlobs('src/parser.ts', ['src/**/*.ts', '!src/**/*.test.ts']),
      true
    );
  });

  it('returns false for empty patterns array', () => {
    assert.equal(matchFileAgainstGlobs('src/parser.ts', []), false);
  });

  it('returns false for null/undefined patterns', () => {
    assert.equal(matchFileAgainstGlobs('src/parser.ts', null), false);
    assert.equal(matchFileAgainstGlobs('src/parser.ts', undefined), false);
  });

  it('** matches everything', () => {
    assert.equal(matchFileAgainstGlobs('src/parser.ts', ['**']), true);
    assert.equal(matchFileAgainstGlobs('README.md', ['**']), true);
    assert.equal(matchFileAgainstGlobs('a/b/c/d.txt', ['**']), true);
  });

  it('normalizes Windows backslash paths', () => {
    assert.equal(matchFileAgainstGlobs('src\\parser.ts', ['src/**/*.ts']), true);
  });

  it('strips leading ./', () => {
    assert.equal(matchFileAgainstGlobs('./src/parser.ts', ['src/**/*.ts']), true);
  });

  it('handles multiple positive patterns', () => {
    assert.equal(matchFileAgainstGlobs('src/app.tsx', ['src/**/*.ts', 'src/**/*.tsx']), true);
    assert.equal(matchFileAgainstGlobs('src/app.ts', ['src/**/*.ts', 'src/**/*.tsx']), true);
  });

  it('negation wins over positive when both match', () => {
    assert.equal(
      matchFileAgainstGlobs('src/utils.spec.ts', ['src/**/*.ts', '!src/**/*.spec.ts']),
      false
    );
  });
});

describe('createRuleMatcher', () => {
  it('returns matcher object with match method', () => {
    const matcher = createRuleMatcher(['src/**/*.ts']);
    assert.equal(typeof matcher.match, 'function');
    assert.equal(matcher.match('src/index.ts'), true);
    assert.equal(matcher.match('README.md'), false);
  });
});
