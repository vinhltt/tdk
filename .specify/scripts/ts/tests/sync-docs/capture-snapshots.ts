// capture-snapshots.ts
// ONE-SHOT script: capture bash + TS outputs for all 6 test modes
// Saves normalized JSON to snapshots/*.snapshot.json
// Run ONCE while bash still exists; commit the resulting snapshots.
// After Phase 6 (bash deletion), tests compare only against snapshots.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { createFixture, teardownFixture } from './fixture-setup';
import { normalizePaths } from './normalize-paths';

const TS_ROOT = resolve(__dirname, '../../');
const BASH_SCRIPTS = resolve(__dirname, '../../../bash');
const SNAPSHOTS_DIR = resolve(__dirname, 'snapshots');

interface CaptureCase {
  name: string;
  flags: string[];
}

const CASES: CaptureCase[] = [
  { name: 'from-sub-real', flags: ['--from-sub-workspace', 'alpha'] },
  { name: 'from-sub-dryrun', flags: ['--from-sub-workspace', 'alpha', '--dry-run'] },
  { name: 'to-sub-real', flags: ['--to-sub-workspace', 'alpha'] },
  { name: 'to-sub-dryrun', flags: ['--to-sub-workspace', 'alpha', '--dry-run'] },
  { name: 'all-real', flags: ['--all'] },
  { name: 'all-dryrun', flags: ['--all', '--dry-run'] },
];

function runBash(cwd: string, args: string[]): { stdout: string; stderr: string } {
  const result = spawnSync('bash', [
    resolve(BASH_SCRIPTS, 'sync-docs.sh'),
    ...args,
  ], {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runTS(cwd: string, args: string[]): { stdout: string; stderr: string } {
  const result = spawnSync('bun', [
    resolve(TS_ROOT, 'src/commands/util/sync-docs.ts'),
    ...args,
  ], {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

async function captureSnapshots() {
  mkdirSync(SNAPSHOTS_DIR, { recursive: true });

  console.log('Capturing snapshots for all 6 test modes...\n');

  for (const testCase of CASES) {
    console.log(`[${testCase.name}] Setting up fixture...`);
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'sync-docs-capture-'));

    try {
      createFixture({ root: fixtureRoot });

      // Capture bash output
      console.log(`[${testCase.name}] Running bash...`);
      const { stdout: bashOutput, stderr: bashErr } = runBash(fixtureRoot, testCase.flags);
      let bashJson: unknown;
      try {
        bashJson = JSON.parse(bashOutput);
      } catch {
        console.error(`[${testCase.name}] BASH PARSE ERROR:`, bashOutput);
        console.error('STDERR:', bashErr);
        process.exit(1);
      }

      // Capture TS output
      console.log(`[${testCase.name}] Running TS...`);
      const { stdout: tsOutput, stderr: tsErr } = runTS(fixtureRoot, testCase.flags);
      let tsJson: unknown;
      try {
        tsJson = JSON.parse(tsOutput);
      } catch {
        console.error(`[${testCase.name}] TS PARSE ERROR:`, tsOutput);
        console.error('STDERR:', tsErr);
        process.exit(1);
      }

      // Normalize paths in both
      const bashNormalized = normalizePaths(bashJson, fixtureRoot);
      const tsNormalized = normalizePaths(tsJson, fixtureRoot);

      // Save bash as canonical snapshot (this is the contract we're testing against)
      const snapshotPath = join(SNAPSHOTS_DIR, `${testCase.name}.snapshot.json`);
      writeFileSync(snapshotPath, JSON.stringify(bashNormalized, null, 2) + '\n');

      console.log(`[${testCase.name}] ✓ Snapshot saved: ${snapshotPath}`);

      // Informational: compare bash vs ts (should be identical post-normalization)
      if (JSON.stringify(bashNormalized) === JSON.stringify(tsNormalized)) {
        console.log(`[${testCase.name}] ✓ Bash and TS outputs are identical\n`);
      } else {
        console.warn(`[${testCase.name}] ⚠ Bash and TS outputs differ!`);
        console.warn('Bash (normalized):', JSON.stringify(bashNormalized, null, 2));
        console.warn('TS (normalized):', JSON.stringify(tsNormalized, null, 2));
        console.log();
      }
    } finally {
      teardownFixture({ root: fixtureRoot });
    }
  }

  console.log(`\n✓ All snapshots captured to: ${SNAPSHOTS_DIR}`);
  console.log('Commit these .snapshot.json files to lock the contract.');
}

captureSnapshots().catch(console.error);
