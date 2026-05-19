// Locate project root via git rev-parse, then upward .specify/ directory search.
// Mirrors Python find_project_root(start).

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Find project root via git, then fallback to upward search for .specify/.
 * Mirrors Python: git rev-parse --show-toplevel → upward .specify/ search → return start.resolve().
 */
export function findProjectRoot(start: string): string {
  // Try git rev-parse --show-toplevel
  try {
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      cwd: start,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {
    // fall through
  }

  // Upward search for .specify/ directory
  let current = fs.realpathSync(start);
  while (true) {
    const specifyPath = path.join(current, '.specify');
    if (fs.existsSync(specifyPath) && fs.statSync(specifyPath).isDirectory()) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }

  return fs.realpathSync(start);
}
