// Resolves cache paths + mtime-based cache validity for tdk-scout.

import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findProjectRoot } from '../manifest/find-project-root';

export interface CachePaths {
  cacheRoot: string;
  packPath: string;
  tier1JsonPath: string;
  outputPath: string;
}

export interface ResolveCacheOpts {
  scopeKey: string;
  cwd?: string;
  packPathOverride?: string;
  outputPathOverride?: string;
}

const CACHE_REL = '.specify/cache/tdk-scout';

export function resolveCachePaths(opts: ResolveCacheOpts): CachePaths {
  const cwd = opts.cwd ?? process.cwd();
  let projectRoot: string;
  try {
    projectRoot = findProjectRoot(cwd);
  } catch {
    projectRoot = resolve(cwd);
  }
  const cacheRoot = join(projectRoot, CACHE_REL);
  mkdirSync(cacheRoot, { recursive: true });

  const packPath = opts.packPathOverride
    ? resolve(opts.packPathOverride)
    : join(cacheRoot, `${opts.scopeKey}.md`);
  const tier1JsonPath = join(cacheRoot, `${opts.scopeKey}-tier1.json`);
  const outputPath = opts.outputPathOverride
    ? resolve(opts.outputPathOverride)
    : join(cacheRoot, `${opts.scopeKey}.md`);

  return { cacheRoot, packPath, tier1JsonPath, outputPath };
}

/**
 * Tier 1 cache valid iff JSON exists AND newer than pack.
 *
 * The cache key deliberately ignores repomix --include/--ignore patterns, and adding a
 * pattern hash would be dead weight. Those patterns only apply in scope mode, and scope
 * mode always re-runs repomix, which rewrites the pack; the pack is then newer than any
 * previously written Tier 1 JSON, so this mtime comparison always reports stale and the
 * extract always re-runs. Two scope runs with different patterns therefore cannot reuse
 * each other's results. Cache hits are reachable only in from-pack mode, which rejects
 * both pattern flags.
 */
export function isTier1CacheValid(tier1JsonPath: string, packPath: string): boolean {
  if (!existsSync(tier1JsonPath) || !existsSync(packPath)) return false;
  const jsonStat = statSync(tier1JsonPath);
  const packStat = statSync(packPath);
  return jsonStat.mtimeMs >= packStat.mtimeMs;
}
