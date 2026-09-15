// The single entry point for running git from this CLI.
//
// `-C <dir>` and the `cwd` option anchor only the *working directory*. Git still reads
// GIT_DIR, GIT_WORK_TREE and friends from the ambient environment, and those win: with
// GIT_DIR/GIT_WORK_TREE exported, `git -C <host> rev-parse --show-toplevel` answers for
// the environment's repository, not the one at <host>. A hook or wrapper that exports
// them therefore silently redirects every "anchored" command in this process.
//
// runGit strips those overrides so the repository is decided by the path we pass and
// nothing else. Every git invocation in src/ goes through here; `grep "execFileSync('git'"`
// must return no hit outside this file.

import { execFileSync } from 'node:child_process';

/**
 * Git environment variables that override path-based repository discovery.
 * Removing them makes `-C`/`cwd` authoritative.
 */
const GIT_REPOSITORY_ENV_OVERRIDES = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
  'GIT_NAMESPACE',
] as const;

/**
 * Environment for a git child process, with repository overrides removed after any caller-supplied
 * additions have been applied.
 */
export function sanitizedGitEnv(
  source: NodeJS.ProcessEnv = process.env,
  additions: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...source, ...additions };
  for (const key of GIT_REPOSITORY_ENV_OVERRIDES) delete env[key];
  return env;
}

export interface RunGitOptions {
  cwd?: string;
  /** Extra environment variables for this invocation; repository overrides remain stripped. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Run git with a sanitized environment and return trimmed stdout.
 *
 * Throws whatever `execFileSync` throws — callers decide whether a failure is fatal or
 * just means "not a git working tree".
 */
export function runGit(args: string[], opts: RunGitOptions = {}): string {
  return execFileSync('git', args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: sanitizedGitEnv(process.env, opts.env),
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
  }).trim();
}
