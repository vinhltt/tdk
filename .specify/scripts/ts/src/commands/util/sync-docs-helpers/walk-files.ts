// walk-files.ts
// Recursive directory walker returning absolute file paths
// Uses fs.readdir with { recursive: true, withFileTypes: true } — Node 20+ / Bun

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Walk a directory recursively and return absolute paths of all files.
 * Matches: bash `find "$source_dir" -type f -print0` (sync-docs.sh lines 196, 271, 337).
 *
 * Uses readdirSync with recursive:true (Node 20 / Bun). Filter to files only.
 */
export function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    // entry.parentPath is the directory path in Node 20.12+ / Bun
    // Fallback: entry.path (deprecated alias)
    const parentPath = (entry as { parentPath?: string }).parentPath ?? (entry as { path?: string }).path ?? dir;
    files.push(join(parentPath, entry.name));
  }
  return files;
}
