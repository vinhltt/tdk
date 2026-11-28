// Unit tests for verify.ts — 6 scenarios per brainstorm §4.3.
// Fixtures live in tmpdir; gitDiff injected as stub for determinism.

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runChecks, inferAffected } from '../../../src/commands/changelog/verify';
import { buildFixture, happyPathSpec } from './fixture-builder';

describe('verify.ts — 6 checks + auto-infer', () => {
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

describe('verify.ts — release version stamps', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'verify-stamps-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const run = () => runChecks({ root, expectedVersion: '1.2.0', plugins: ['tdk-utils'], skills: ['brainstorming'] });

  function expectRegenerateHint(hint: string | undefined): void {
    expect(hint).toBeDefined();
    expect(hint).toContain('do not edit it by hand');
    const manifestStep = hint!.indexOf('bun run manifest');
    const releaseStep = hint!.indexOf('generate-release-manifest.ts');
    expect(manifestStep).toBeGreaterThan(-1);
    expect(releaseStep).toBeGreaterThan(manifestStep);
    expect(hint).toContain(`(cd "${root}/.specify/scripts/ts" && bun run manifest --project-root "${root}" --write) && bun "${root}/.claude/skills/tdk-bump/scripts/generate-release-manifest.ts" --project-root "${root}" --write`);
  }

  it('passes both stamps when they equal the expected version', () => {
    buildFixture(root, happyPathSpec());
    const stamps = run().filter(r => r.index === 6);
    expect(stamps.length).toBe(2);
    expect(stamps.every(r => r.ok)).toBe(true);
  });

  it('fails the release manifest stamp when it lags the marketplace', () => {
    const spec = happyPathSpec();
    spec.releaseManifestTdkVersion = '1.1.0';
    buildFixture(root, spec);
    const fails = run().filter(r => !r.ok);
    expect(fails.length).toBe(1);
    expect(fails[0]?.index).toBe(6);
    expect(fails[0]?.name).toContain('release-manifest');
    expect(fails[0]?.expected).toBe('1.2.0');
    expect(fails[0]?.actual).toBe('1.1.0');
    expectRegenerateHint(fails[0]?.fixHint);
  });

  it('builds the regenerate hint from an absolute root even when the root is relative', () => {
    const spec = happyPathSpec();
    spec.releaseManifestTdkVersion = '1.1.0';
    buildFixture(root, spec);
    const relativeRoot = relative(process.cwd(), root);
    expect(relativeRoot.startsWith('/')).toBe(false);
    const fails = runChecks({ root: relativeRoot, expectedVersion: '1.2.0', plugins: ['tdk-utils'], skills: ['brainstorming'] })
      .filter(r => !r.ok);
    expect(fails.length).toBe(1);
    expect(fails[0]?.fixHint).toContain(`--project-root "${root}" --write`);
    expect(fails[0]?.fixHint).not.toContain(relativeRoot === '' ? '\0' : `"${relativeRoot}"`);
  });

  it('fails the plugins manifest stamp when it lags the marketplace', () => {
    const spec = happyPathSpec();
    spec.pluginsManifestTdkVersion = '1.1.0';
    buildFixture(root, spec);
    const fails = run().filter(r => !r.ok);
    expect(fails.length).toBe(1);
    expect(fails[0]?.name).toContain('plugins manifest');
    expect(fails[0]?.actual).toBe('1.1.0');
    expectRegenerateHint(fails[0]?.fixHint);
  });

  it('fails a stamp that is absent from its file', () => {
    const spec = happyPathSpec();
    spec.releaseManifestTdkVersion = null;
    spec.pluginsManifestTdkVersion = null;
    buildFixture(root, spec);
    const fails = run().filter(r => !r.ok && r.index === 6);
    expect(fails.length).toBe(2);
    for (const fail of fails) {
      expect(fail.actual).toBe('(missing)');
      expectRegenerateHint(fail.fixHint);
    }
  });

  it('fails a stamp that is not a semver string', () => {
    const spec = happyPathSpec();
    spec.releaseManifestTdkVersion = 'latest';
    buildFixture(root, spec);
    const fail = run().find(r => !r.ok && r.index === 6);
    expect(fail?.actual).toContain('invalid');
  });

  it('fails when the release manifest file is missing', () => {
    const spec = happyPathSpec();
    spec.omitReleaseManifest = true;
    buildFixture(root, spec);
    const fail = run().find(r => !r.ok && r.index === 6);
    expect(fail?.name).toContain('release-manifest');
    expect(fail?.actual).toBe('file missing');
    expectRegenerateHint(fail?.fixHint);
  });

  it('fails when a stamp file is not valid JSON', () => {
    buildFixture(root, happyPathSpec());
    writeFileSync(join(root, '.specify', 'release-manifest.json'), '{ nope');
    const fail = run().find(r => !r.ok && r.index === 6);
    expect(fail?.actual).toContain('parse error');
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
