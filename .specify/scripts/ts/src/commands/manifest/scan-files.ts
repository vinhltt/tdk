// Recursive file scanner + SHA-256 hasher. Mirrors Python scan_plugin_files + compute_file_sha256.
// EXCLUDE_DIRS checked against any path component (matches Python: any(p in EXCLUDE_DIRS for p in parts)).
// All returned paths use forward slashes (path.sep normalization for Windows compat).

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { EXCLUDE_DIRS, EXCLUDE_EXTENSIONS } from './types';

/**
 * Recursively collect all files under pluginDir, excluding EXCLUDE_DIRS and EXCLUDE_EXTENSIONS.
 * Returns sorted list of absolute paths (sorted by forward-slash relative path — matches Python).
 */
function collectFiles(pluginDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  walk(pluginDir);

  // Filter: exclude if any path component matches EXCLUDE_DIRS, or extension matches EXCLUDE_EXTENSIONS
  return results.filter((f) => {
    const rel = path.relative(pluginDir, f);
    const parts = rel.split(path.sep);
    // Python: any(p in EXCLUDE_DIRS for p in parts)
    if (parts.some((p) => EXCLUDE_DIRS.has(p))) return false;
    if (EXCLUDE_EXTENSIONS.has(path.extname(f))) return false;
    return true;
  });
}

/** Normalize absolute path to forward-slash relative path from pluginDir. */
export function toRelPath(pluginDir: string, absPath: string): string {
  return path.relative(pluginDir, absPath).split(path.sep).join('/');
}

/** Compute SHA-256 hex digest of a file (full read — files are moderate size). */
export function computeFileSha256(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Scan plugin directory and return map of relPath → sha256hex, sorted by relPath.
 * Matches Python: scan_plugin_files returns sorted list; main() builds the dict in that order.
 */
export function scanPluginFiles(pluginDir: string): Map<string, string> {
  const files = collectFiles(pluginDir);

  // Sort by forward-slash relative path (mirrors Python sorted(..., key=lambda p: str(p.relative_to(plugin_dir)).replace("\\", "/")))
  files.sort((a, b) => {
    const ra = toRelPath(pluginDir, a);
    const rb = toRelPath(pluginDir, b);
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });

  const result = new Map<string, string>();
  for (const f of files) {
    result.set(toRelPath(pluginDir, f), computeFileSha256(f));
  }
  return result;
}
