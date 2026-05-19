// Wraps the repomix binary. Uses spawnSync (array-form args; no shell interpolation).

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RunRepomixOpts {
  scope: string;
  outputPath: string;
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
    [opts.scope, '--style', 'markdown', '-o', opts.outputPath],
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
