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

/** Tier 1 cache valid iff JSON exists AND newer than pack. */
export function isTier1CacheValid(tier1JsonPath: string, packPath: string): boolean {
  if (!existsSync(tier1JsonPath) || !existsSync(packPath)) return false;
  const jsonStat = statSync(tier1JsonPath);
  const packStat = statSync(packPath);
  return jsonStat.mtimeMs >= packStat.mtimeMs;
}
