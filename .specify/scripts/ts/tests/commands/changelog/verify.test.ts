// Unit tests for verify.ts — 6 scenarios per brainstorm §4.3.
// Fixtures live in tmpdir; gitDiff injected as stub for determinism.

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runChecks, inferAffected } from '../../../src/commands/changelog/verify';
import { buildFixture, happyPathSpec } from './fixture-builder';

describe('verify.ts — 5 checks + auto-infer', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'verify-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('S1: all pass → 0 failures', () => {
    buildFixture(root, happyPathSpec());
    const results = runChecks({
      root,
      expectedVersion: '1.2.0',
      plugins: ['tdk-utils'],
      skills: ['brainstorming'],
    });
    const failures = results.filter(r => !r.ok);
    expect(failures.length).toBe(0);
  });

  it('S2: CHANGELOG missing header → check 1 fails', () => {
    const spec = happyPathSpec();
    spec.changelogHeaderVersion = null; // omit the header entirely
    buildFixture(root, spec);
    const results = runChecks({
      root,
      expectedVersion: '1.2.0',
      plugins: ['tdk-utils'],
      skills: ['brainstorming'],
    });
    const fail = results.find(r => !r.ok && r.index === 1);
    expect(fail).toBeDefined();
    expect(fail?.name).toBe('CHANGELOG header');
  });

  it('S3: plugin.json stale → check 3 fails', () => {
    const spec = happyPathSpec();
    spec.plugins[0]!.pluginJsonVersion = '0.5.99'; // drift from manifest 0.6.1
    buildFixture(root, spec);
    const results = runChecks({
      root,
      expectedVersion: '1.2.0',
      plugins: ['tdk-utils'],
      skills: ['brainstorming'],
    });
    const fail = results.find(r => !r.ok && r.index === 3);
    expect(fail).toBeDefined();
    expect(fail?.expected).toBe('0.6.1');
    expect(fail?.actual).toBe('0.5.99');
    expect(fail?.name).toContain('claude');
  });

  it('S3b: codex plugin.json stale → check 3 fails on codex mirror', () => {
    const spec = happyPathSpec();
    spec.plugins[0]!.codexPluginJsonVersion = '0.5.99'; // claude=0.6.1, codex=0.5.99
    buildFixture(root, spec);
    const results = runChecks({
      root,
      expectedVersion: '1.2.0',
      plugins: ['tdk-utils'],
      skills: ['brainstorming'],
    });
    const fail = results.find(r => !r.ok && r.index === 3 && r.name.includes('codex'));
    expect(fail).toBeDefined();
    expect(fail?.expected).toBe('0.6.1');
    expect(fail?.actual).toBe('0.5.99');
    // Claude mirror still passes
    const claudePass = results.find(r => r.ok && r.index === 3 && r.name.includes('claude'));
    expect(claudePass).toBeDefined();
  });

  it('S3c: cursor plugin.json stale → check 3 fails on cursor mirror', () => {
    const spec = happyPathSpec();
    spec.plugins[0]!.cursorPluginJsonVersion = '0.4.0'; // claude=0.6.1, cursor=0.4.0
    buildFixture(root, spec);
    const results = runChecks({
      root,
      expectedVersion: '1.2.0',
      plugins: ['tdk-utils'],
      skills: ['brainstorming'],
    });
    const fail = results.find(r => !r.ok && r.index === 3 && r.name.includes('cursor'));
    expect(fail).toBeDefined();
    expect(fail?.expected).toBe('0.6.1');
    expect(fail?.actual).toBe('0.4.0');
  });

  it('S3d: all 3 formats in sync → check 3 passes', () => {
    const spec = happyPathSpec();
    spec.plugins[0]!.codexPluginJsonVersion = '0.6.1';
    spec.plugins[0]!.cursorPluginJsonVersion = '0.6.1';
    buildFixture(root, spec);
    const results = runChecks({
      root,
      expectedVersion: '1.2.0',
      plugins: ['tdk-utils'],
      skills: ['brainstorming'],
    });
    const fails = results.filter(r => !r.ok);
    expect(fails.length).toBe(0);
    const formats = results
      .filter(r => r.ok && r.index === 3)
      .map(r => r.name);
    expect(formats.some(n => n.includes('claude'))).toBe(true);
    expect(formats.some(n => n.includes('codex'))).toBe(true);
    expect(formats.some(n => n.includes('cursor'))).toBe(true);
  });

  it('S4: SKILL.md frontmatter drift → check 4 fails', () => {
    const spec = happyPathSpec();
    spec.plugins[0]!.skills![0]!.frontmatterVersion = '1.1.0'; // drift from manifest 1.2.0
    buildFixture(root, spec);
    const results = runChecks({
      root,
      expectedVersion: '1.2.0',
      plugins: ['tdk-utils'],
      skills: ['brainstorming'],
    });
    const fail = results.find(r => !r.ok && r.index === 4);
    expect(fail).toBeDefined();
    expect(fail?.expected).toBe('1.2.0');
    expect(fail?.actual).toBe('1.1.0');
  });

  it('S5: marketplace.json mismatch → check 2 fails', () => {
    const spec = happyPathSpec();
    spec.marketplaceVersion = '1.1.9'; // drift from expected 1.2.0
    buildFixture(root, spec);
    const results = runChecks({
      root,
      expectedVersion: '1.2.0',
      plugins: ['tdk-utils'],
      skills: ['brainstorming'],
    });
    const fail = results.find(r => !r.ok && r.index === 2);
    expect(fail).toBeDefined();
    expect(fail?.expected).toBe('1.2.0');
    expect(fail?.actual).toBe('1.1.9');
  });

  it('S6: --plugins override wins over auto-infer from gitDiff stub', () => {
    // Build a fixture where auto-infer would pick a different plugin than explicit arg.
    const spec = happyPathSpec();
    spec.plugins.push({
      name: 'other-plugin',
      pluginJsonVersion: '9.9.9', // would fail check 3 if auto-inferred (vs manifest 0.0.1)
      manifestVersion: '0.0.1',
    });
    buildFixture(root, spec);

    // Stub gitDiff to return changes under "other-plugin" only.
    const gitDiffStub = () => ['.specify/plugins/other-plugin/plugin.json'];

    // Explicit plugins=tdk-utils should override → no failure on "other-plugin".
    const explicitResults = runChecks(
      {
        root,
        expectedVersion: '1.2.0',
        plugins: ['tdk-utils'],
        skills: ['brainstorming'],
      },
      { gitDiff: gitDiffStub },
    );
    const explicitFails = explicitResults.filter(r => !r.ok);
    expect(explicitFails.length).toBe(0);

    // With empty explicit args, auto-infer kicks in → other-plugin surfaces drift.
    const inferredResults = runChecks(
      { root, expectedVersion: '1.2.0', plugins: [], skills: [] },
      { gitDiff: gitDiffStub },
    );
    const inferredFail = inferredResults.find(r => !r.ok && r.index === 3);
    expect(inferredFail).toBeDefined();
  });
});

describe('verify.ts — inferAffected helper', () => {
  it('extracts plugins + skills from file paths', () => {
    const out = inferAffected([
      '.specify/plugins/foo/plugin.json',
      '.specify/plugins/foo/skills/bar/SKILL.md',
      '.specify/plugins/baz/.claude-plugin/plugin.json',
      'unrelated/file.txt',
    ]);
    expect(out.plugins).toEqual(['baz', 'foo']);
    expect(out.skills).toEqual(['bar']);
  });

  it('returns empty for no matches', () => {
    const out = inferAffected(['README.md', 'src/index.ts']);
    expect(out.plugins).toEqual([]);
    expect(out.skills).toEqual([]);
  });
});
