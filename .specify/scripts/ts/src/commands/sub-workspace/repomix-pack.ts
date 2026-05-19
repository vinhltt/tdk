// Wraps repomix for sub-workspace doc packing.
// Differs from commands/scout/repomix-runner.ts by passing --token-count-tree and parsing total tokens.

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DocsError } from './types';

export type PackResult = {
  packedFile: string;
  tokenCount: number; // -1 if parse failed
};

export function ensureRepomixOnPath(): void {
  const probe = spawnSync('repomix', ['--version'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });
  if (probe.status !== 0) {
    throw new DocsError(
      'MISSING_BIN',
      'repomix not found on PATH. Install: npm install -g repomix',
    );
  }
}

/** Parse "Total Tokens: 42,100 tokens" or similar from repomix output. Returns -1 on failure. */
export function parseTokenCount(output: string): number {
  // Defensive: repomix output format may shift across versions.
  const match = output.match(/Total\s+Tokens?\s*:\s*([\d,]+)/i);
  if (!match) return -1;
  const num = parseInt((match[1] ?? '').replace(/,/g, ''), 10);
  return Number.isFinite(num) ? num : -1;
}

export type RunPackOpts = {
  scope: string;       // absolute path to sub-workspace dir
  outputPath: string;  // absolute path to packed .md file
};

export function runRepomixPack(opts: RunPackOpts): PackResult {
  mkdirSync(dirname(opts.outputPath), { recursive: true });

  const result = spawnSync(
    'repomix',
    [opts.scope, '--style', 'markdown', '--token-count-tree', '-o', opts.outputPath],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' },
  );

  // Forward to stderr — stdout is reserved for the final JSON envelope.
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (combined) process.stderr.write(combined);

  if (result.status !== 0) {
    throw new DocsError(
      'MISSING_PATH',
      `repomix failed for ${opts.scope} (status ${result.status})`,
    );
  }

  return {
    packedFile: opts.outputPath,
    tokenCount: parseTokenCount(combined),
  };
}
