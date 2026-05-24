'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadRules, parseFrontmatter, needsRebuild } = require('../lib/rule-loader.cjs');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-loader-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeRule(name, frontmatter, body) {
  const content = `---\n${frontmatter}\n---\n${body}`;
  fs.writeFileSync(path.join(tmpDir, name), content);
}

describe('parseFrontmatter', () => {
  it('parses valid frontmatter with paths and description', () => {
    const result = parseFrontmatter('---\npaths:\n  - "src/**/*.ts"\ndescription: "TS rules"\n---\nRule body here');
    assert.deepEqual(result.paths, ['src/**/*.ts']);
    assert.equal(result.description, 'TS rules');
    assert.equal(result.body, 'Rule body here');
    assert.equal(result.inject, 'full');
    assert.equal(result.isAlwaysApply, false);
  });

  it('defaults inject to full when omitted', () => {
    const result = parseFrontmatter('---\npaths:\n  - "**"\n---\nbody');
    assert.equal(result.inject, 'full');
  });

  it('parses inject: reference', () => {
    const result = parseFrontmatter('---\npaths:\n  - "src/**"\ninject: reference\n---\nbody');
    assert.equal(result.inject, 'reference');
  });

  it('falls back to full on invalid inject value', () => {
    const result = parseFrontmatter('---\npaths:\n  - "src/**"\ninject: banana\n---\nbody');
    assert.equal(result.inject, 'full');
  });

  it('detects always-apply from paths: ["**"]', () => {
    const result = parseFrontmatter('---\npaths:\n  - "**"\n---\nbody');
    assert.equal(result.isAlwaysApply, true);
  });

  it('paths: [] is not always-apply', () => {
    const result = parseFrontmatter('---\npaths: []\n---\nbody');
    assert.equal(result.isAlwaysApply, false);
    assert.deepEqual(result.paths, []);
  });

  it('missing paths defaults to empty array', () => {
    const result = parseFrontmatter('---\ndescription: "test"\n---\nbody');
    assert.deepEqual(result.paths, []);
    assert.equal(result.isAlwaysApply, false);
  });

  it('handles inline array format', () => {
    const result = parseFrontmatter('---\npaths: ["a", "b"]\n---\nbody');
    assert.deepEqual(result.paths, ['a', 'b']);
  });

  it('handles YAML comments', () => {
    const result = parseFrontmatter('---\npaths:\n  - "src/**" # main source\ndescription: "test" # comment\n---\nbody');
    assert.deepEqual(result.paths, ['src/**']);
    assert.equal(result.description, 'test');
  });

  it('returns null for malformed frontmatter', () => {
    assert.equal(parseFrontmatter('no frontmatter here'), null);
    assert.equal(parseFrontmatter('---\nonly opening'), null);
  });
});

describe('loadRules', () => {
  it('loads rules from directory', () => {
    writeRule('ts-rules.md', 'paths:\n  - "src/**/*.ts"\ndescription: "TS"', '- Use strict TS');
    const rules = loadRules(tmpDir);
    assert.equal(rules.length, 1);
    assert.equal(rules[0].file, 'ts-rules.md');
    assert.deepEqual(rules[0].paths, ['src/**/*.ts']);
    assert.equal(rules[0].body, '- Use strict TS');
  });

  it('returns empty array for nonexistent directory', () => {
    assert.deepEqual(loadRules('/nonexistent/path'), []);
  });

  it('returns empty array for null/undefined', () => {
    assert.deepEqual(loadRules(null), []);
    assert.deepEqual(loadRules(undefined), []);
  });

  it('returns empty array for empty directory', () => {
    assert.deepEqual(loadRules(tmpDir), []);
  });

  it('ignores non-.md files', () => {
    writeRule('rule.md', 'paths:\n  - "**"', 'body');
    fs.writeFileSync(path.join(tmpDir, 'notes.txt'), 'not a rule');
    const rules = loadRules(tmpDir);
    assert.equal(rules.length, 1);
  });

  it('skips malformed frontmatter files', () => {
    writeRule('good.md', 'paths:\n  - "**"', 'body');
    fs.writeFileSync(path.join(tmpDir, 'bad.md'), 'no frontmatter here');
    const rules = loadRules(tmpDir);
    assert.equal(rules.length, 1);
    assert.equal(rules[0].file, 'good.md');
  });

  it('creates rules-cache.json after first load', () => {
    writeRule('rule.md', 'paths:\n  - "**"', 'body');
    loadRules(tmpDir);
    assert.equal(fs.existsSync(path.join(tmpDir, 'rules-cache.json')), true);
  });

  it('reads from cache on second load with no changes', () => {
    writeRule('rule.md', 'paths:\n  - "**"', 'body');
    loadRules(tmpDir);
    const cacheMtime1 = fs.statSync(path.join(tmpDir, 'rules-cache.json')).mtimeMs;

    // Small delay to ensure mtime would differ if rewritten
    const start = Date.now();
    while (Date.now() - start < 50) { /* busy wait */ }

    loadRules(tmpDir);
    const cacheMtime2 = fs.statSync(path.join(tmpDir, 'rules-cache.json')).mtimeMs;
    assert.equal(cacheMtime1, cacheMtime2);
  });

  it('rebuilds cache when .md file is modified', () => {
    writeRule('rule.md', 'paths:\n  - "**"', 'original body');
    loadRules(tmpDir);

    // Small delay then modify
    const start = Date.now();
    while (Date.now() - start < 50) { /* busy wait */ }

    writeRule('rule.md', 'paths:\n  - "**"', 'updated body');
    const rules = loadRules(tmpDir);
    assert.equal(rules[0].body, 'updated body');
  });

  it('rebuilds cache when new .md file added', () => {
    writeRule('rule1.md', 'paths:\n  - "**"', 'body1');
    loadRules(tmpDir);

    const start = Date.now();
    while (Date.now() - start < 50) { /* busy wait */ }

    writeRule('rule2.md', 'paths:\n  - "src/**"', 'body2');
    const rules = loadRules(tmpDir);
    assert.equal(rules.length, 2);
  });
});

describe('needsRebuild', () => {
  it('returns true when cache file does not exist', () => {
    assert.equal(needsRebuild(path.join(tmpDir, 'rules-cache.json'), tmpDir), true);
  });
});
