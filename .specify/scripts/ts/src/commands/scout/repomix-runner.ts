// Wraps the repomix binary. Uses spawnSync (array-form args; no shell interpolation).

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RunRepomixOpts {
  scope: string;
  outputPath: string;
  include?: string[];
  ignore?: string[];
}

/**
 * Builds the repomix argv. Patterns are passed as a single comma-separated value per flag,
 * which is what repomix expects; array form keeps them out of any shell.
 * Omitting both pattern fields yields the same argv as before the flags existed.
 */
export function buildRepomixArgs(opts: RunRepomixOpts): string[] {
  const args = [opts.scope, '--style', 'markdown', '-o', opts.outputPath];
  if (opts.include && opts.include.length > 0) args.push('--include', opts.include.join(','));
  if (opts.ignore && opts.ignore.length > 0) args.push('--ignore', opts.ignore.join(','));
  return args;
}

export function ensureRepomixOnPath(): void {
  const probe = spawnSync('repomix', ['--version'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });
  if (probe.status !== 0) {
    throw new Error(
      'repomix binary not found on PATH.\n' +
      'Install: npm install -g repomix (or brew install repomix)',
    );
  }
}

export function runRepomix(opts: RunRepomixOpts): string {
  ensureRepomixOnPath();
  mkdirSync(dirname(opts.outputPath), { recursive: true });

  const result = spawnSync(
    'repomix',
    buildRepomixArgs(opts),
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' },
  );

  // Forward repomix output to stderr so stdout is reserved for our final JSON line.
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    throw new Error(`repomix exited with status ${result.status} (scope: ${opts.scope})`);
  }
  return opts.outputPath;
}
