// Resolves cache paths + mtime/schema-version validity for tdk-scout.

import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findProjectRoot } from '../manifest/find-project-root';
import { TIER1_VERSION, type Tier1Result } from './types';

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
 * Tier 1 cache valid iff JSON exists, is newer than pack, and has the current schema version.
 *
 * The cache key deliberately ignores repomix --include/--ignore patterns, and adding a
 * pattern hash would be dead weight. Those patterns only apply in scope mode, and scope
 * mode always re-runs repomix, which rewrites the pack; the pack is then newer than any
 * previously written Tier 1 JSON, so this mtime comparison always reports stale and the
 * extract always re-runs. Two scope runs with different patterns therefore cannot reuse
 * each other's results. Cache hits are reachable only in from-pack mode, which rejects
 * both pattern flags.
 */
export function readTier1Cache(tier1JsonPath: string, packPath: string): Tier1Result | undefined {
  if (!existsSync(tier1JsonPath) || !existsSync(packPath)) return undefined;
  const jsonStat = statSync(tier1JsonPath);
  const packStat = statSync(packPath);
  if (jsonStat.mtimeMs < packStat.mtimeMs) return undefined;
  try {
    const cached = JSON.parse(readFileSync(tier1JsonPath, 'utf-8'));
    return cached?.tier1Version === TIER1_VERSION ? cached : undefined;
  } catch {
    return undefined;
  }
}
