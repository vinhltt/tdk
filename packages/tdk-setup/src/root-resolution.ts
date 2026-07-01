import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface ConsumerRootResult {
  consumerRoot: string;
  warnings: string[];
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function nearestGitRoot(start: string): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: start,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : undefined;
}

export function resolveConsumerRoot(cwd: string): ConsumerRootResult {
  let current = fs.realpathSync(cwd);
  let partialSpecify: string | undefined;

  while (true) {
    const specifyDir = path.join(current, '.specify');
    const scriptsDir = path.join(specifyDir, 'scripts', 'ts');
    const pluginsDir = path.join(specifyDir, 'plugins');

    if (isDirectory(scriptsDir) && isDirectory(pluginsDir)) {
      const gitRoot = nearestGitRoot(cwd);
      const warnings = gitRoot && path.resolve(gitRoot) !== current
        ? [`Using nearest .specify substrate at ${current}; git root is ${gitRoot}.`]
        : [];
      return { consumerRoot: current, warnings };
    }

    if (!partialSpecify && isDirectory(specifyDir)) {
      partialSpecify = current;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (partialSpecify) {
    throw new Error(`Found partial .specify substrate at ${partialSpecify}, but .specify/plugins is missing. Rerun distribute.sh for this consumer project.`);
  }
  throw new Error('Could not find a consumer root containing .specify/scripts/ts and .specify/plugins. Rerun distribute.sh first.');
}
