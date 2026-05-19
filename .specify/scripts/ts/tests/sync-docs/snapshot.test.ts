// snapshot.test.ts
// Snapshot parity tests for sync-docs TS vs bash
// Locks the JSON output contract before bash deletion in Phase 6
// Each test: reset fixture → run TS → compare to bash snapshot

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createFixture, teardownFixture } from './fixture-setup';
import { normalizePaths } from './normalize-paths';

const TS_ROOT = resolve(__dirname, '../../');
const SNAPSHOTS_DIR = resolve(__dirname, 'snapshots');

describe('sync-docs snapshot parity tests', () => {
  let fixtureRoot: string;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'sync-docs-test-'));
    createFixture({ root: fixtureRoot });
  });

  afterEach(() => {
    teardownFixture({ root: fixtureRoot });
  });

  function runTS(args: string[]): string {
    const result = spawnSync('bun', [
      resolve(TS_ROOT, 'src/commands/util/sync-docs.ts'),
      ...args,
    ], {
      cwd: fixtureRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return result.stdout || '';
  }

  function loadSnapshot(filename: string): unknown {
    const snapshotPath = join(SNAPSHOTS_DIR, `${filename}.snapshot.json`);
    const content = readFileSync(snapshotPath, 'utf-8');
    return JSON.parse(content);
  }

  function compareToSnapshot(tsOutput: string, snapshotName: string): void {
    const tsJson = JSON.parse(tsOutput);
    const tsNormalized = normalizePaths(tsJson, fixtureRoot);
    const snapshot = loadSnapshot(snapshotName);

    expect(tsNormalized).toEqual(snapshot);
  }

  // --- Test cases: 6 modes (3 modes × {dry-run, real}) ---

  it('S-01: --from-sub-workspace alpha (real)', () => {
    const tsOutput = runTS(['--from-sub-workspace', 'alpha']);
    compareToSnapshot(tsOutput, 'from-sub-real');
  });

  it('S-02: --from-sub-workspace alpha --dry-run', () => {
    const tsOutput = runTS(['--from-sub-workspace', 'alpha', '--dry-run']);
    compareToSnapshot(tsOutput, 'from-sub-dryrun');
  });

  it('S-03: --to-sub-workspace alpha (real)', () => {
    const tsOutput = runTS(['--to-sub-workspace', 'alpha']);
    compareToSnapshot(tsOutput, 'to-sub-real');
  });

  it('S-04: --to-sub-workspace alpha --dry-run', () => {
    const tsOutput = runTS(['--to-sub-workspace', 'alpha', '--dry-run']);
    compareToSnapshot(tsOutput, 'to-sub-dryrun');
  });

  it('S-05: --all (real)', () => {
    const tsOutput = runTS(['--all']);
    compareToSnapshot(tsOutput, 'all-real');
  });

  it('S-06: --all --dry-run', () => {
    const tsOutput = runTS(['--all', '--dry-run']);
    compareToSnapshot(tsOutput, 'all-dryrun');
  });

  // --- Parity notes for Phase 4 documentation ---
  // DIRECTION field:
  //   - from-sub-workspace: NO DIRECTION field (matches bash lines 198-207)
  //   - to-sub-workspace: DIRECTION='to-sub-workspace' (matches bash lines 273-283)
  //   - all: DIRECTION='all' (matches bash lines 347-354)
  // Bug fix: bash never sets $DIRECTION var (line 129 guard never triggers).
  //          TS fixes this via syncOpts.direction tracking. Documented in Phase 5 CHANGELOG.
  // Backup stdout leak: bash emits backup paths to stdout (line 105). TS sends to stderr only.
  // YAML sub-config: bash uses yq to read .specify.yaml; TS parseConfig uses JSON fallback.
});
