// tdk-scout CLI: parse args → repomix (if --scope) → Tier 1 extract → emit JSON contract on stdout.
// Stdout is reserved for the final JSON line (parsed by SKILL.md downstream).
// All logs/progress go to stderr.

import { Command } from 'commander';
import { statSync } from 'node:fs';
import { posix } from 'node:path';
import { validateArgs, type ResolvedArgs } from './args-validator';
import { resolveCachePaths, readTier1Cache } from './cache-resolver';
import { runRepomix } from './repomix-runner';
import { extractPack } from './extract';
import { MAX_REPRESENTATIVE_FILES } from './dir-aggregator';
import { MAX_SCOUT_FILES, MAX_AGGREGATED_BYTES, TIER1_VERSION, type Tier1Result } from './types';
import { writeAgentJson } from '../../utils/index';

// Pack bytes are an advisory signal only; extracted file count chooses the output mode.
const PACK_SIZE_WARN_BYTES = 1_000_000;

export interface RunDeps {
  runRepomix?: typeof runRepomix;
  extractPack?: typeof extractPack;
  readTier1Cache?: typeof readTier1Cache;
}

export interface RunResult {
  packPath: string;
  tier1JsonPath: string;
  outputPath: string;
  taskHint: string;
  sampleBudget: number;
  cacheHit: boolean;
}

export function runScout(args: ResolvedArgs, deps: RunDeps = {}): RunResult {
  const repomix = deps.runRepomix ?? runRepomix;
  const extract = deps.extractPack ?? extractPack;
  const readCache = deps.readTier1Cache ?? readTier1Cache;

  const packPathOverride = args.mode === 'from-pack' ? args.packPath : undefined;
  const paths = resolveCachePaths({
    scopeKey: args.scopeKey,
    packPathOverride,
    outputPathOverride: args.output,
  });

  let packPath: string;
  if (args.mode === 'scope') {
    process.stderr.write(`[tdk-scout] running repomix on ${args.scope}\n`);
    packPath = repomix({
      scope: args.scope!,
      outputPath: paths.packPath,
      include: args.include,
      ignore: args.ignore,
    });
  } else {
    packPath = paths.packPath;
  }

  warnOnLargePack(packPath);

  let cacheHit = false;
  const cached = args.forceRefresh ? undefined : readCache(paths.tier1JsonPath, packPath);
  if (cached !== undefined) {
    assertCachedTier1(cached, paths.tier1JsonPath);
    process.stderr.write('[tdk-scout] tier 1 cache hit\n');
    cacheHit = true;
  } else {
    process.stderr.write('[tdk-scout] running tier 1 extract\n');
    extract(packPath, paths.tier1JsonPath, { scope: args.scopeKey });
  }

  return {
    packPath,
    tier1JsonPath: paths.tier1JsonPath,
    outputPath: paths.outputPath,
    taskHint: args.taskHint,
    sampleBudget: args.sampleBudget,
    cacheHit,
  };
}

/** Approximate early signal; oversized scopes are bounded during extraction, not rejected. */
function warnOnLargePack(packPath: string): void {
  const packBytes = statSync(packPath).size;
  if (packBytes <= PACK_SIZE_WARN_BYTES) return;
  process.stderr.write(
    `[tdk-scout] warning: pack is ${packBytes} bytes (> ${PACK_SIZE_WARN_BYTES}); ` +
    `tier 1 uses bounded directory aggregation above ${MAX_SCOUT_FILES} files. ` +
    'Pack bytes alone do not determine report size.\n',
  );
}

/** Version alone cannot make a count-only, unbounded or inconsistent cached artifact usable. */
function assertCachedTier1(tier1: Tier1Result, path: string): void {
  const recovery = 'Re-run with --force-refresh to rebuild it.';
  if (typeof tier1.totalFiles !== 'number' || !Number.isSafeInteger(tier1.totalFiles) || tier1.totalFiles < 0) {
    throw new Error(`cached tier 1 JSON has no usable totalFiles: ${path}. ${recovery}`);
  }
  let valid = tier1.tier1Version === TIER1_VERSION &&
    typeof tier1.scope === 'string' && tier1.scope.length > 0 &&
    typeof tier1.tier1GeneratedAt === 'string' && tier1.tier1GeneratedAt.length > 0 &&
    Number.isSafeInteger(tier1.totalLoc) && tier1.totalLoc >= 0 &&
    Number.isSafeInteger(tier1.totalTokens) && tier1.totalTokens >= 0 &&
    Array.isArray(tier1.files) && isStringArray(tier1.unparsed) && tier1.tree !== null &&
    typeof tier1.tree === 'object' && !Array.isArray(tier1.tree);
  let filePaths: Set<string> | undefined;
  if (valid) {
    valid = tier1.files.every((file) => file !== null && typeof file === 'object' &&
      typeof file.path === 'string' && file.path.length > 0 &&
      Number.isSafeInteger(file.loc) && file.loc >= 0 &&
      Number.isSafeInteger(file.tokens) && file.tokens >= 0 &&
      isStringArray(file.imports) && isStringArray(file.exports) && isStringArray(file.symbols));
    if (valid) {
      filePaths = new Set(tier1.files.map((file) => file.path));
      valid = filePaths.size === tier1.files.length &&
        tier1.unparsed.every((file) => filePaths!.has(file));
    }
    if (tier1.totalFiles <= MAX_SCOUT_FILES) {
      valid &&= tier1.aggregated === undefined && tier1.files.length === tier1.totalFiles;
    } else {
      const groups = tier1.aggregated;
      valid &&= tier1.files.length > 0 && tier1.files.length <= MAX_REPRESENTATIVE_FILES &&
        typeof tier1.aggregationDepth === 'number' && Number.isSafeInteger(tier1.aggregationDepth) &&
        tier1.aggregationDepth >= 0 && typeof tier1.unparsedCount === 'number' &&
        Number.isSafeInteger(tier1.unparsedCount) && tier1.unparsedCount >= tier1.unparsed.length &&
        tier1.unparsedCount <= tier1.totalFiles && Array.isArray(groups) && groups.length > 0 &&
        statSync(path).size <= MAX_AGGREGATED_BYTES;
      if (valid && groups) {
        const groupPaths = new Set<string>();
        const fileGroups = new Map<string, string>();
        for (const file of tier1.files) {
          const parent = posix.dirname(posix.normalize(file.path));
          const group = tier1.aggregationDepth === 0 || parent === '.' ? '.' :
            parent.split('/').slice(0, tier1.aggregationDepth).join('/');
          fileGroups.set(file.path, group);
        }
        let totalFiles = 0;
        let totalLoc = 0;
        let totalTokens = 0;
        for (const group of groups) {
          if (group === null || typeof group !== 'object' || typeof group.path !== 'string' ||
            !group.path || groupPaths.has(group.path) || !Number.isSafeInteger(group.fileCount) ||
            group.fileCount <= 0 || !Number.isSafeInteger(group.totalLoc) || group.totalLoc < 0 ||
            !Number.isSafeInteger(group.totalTokens) || group.totalTokens < 0 ||
            !Array.isArray(group.entryPoints) || group.entryPoints.length === 0 ||
            !group.entryPoints.every((entry) => typeof entry === 'string' && fileGroups.get(entry) === group.path) ||
            !Array.isArray(group.imports)) {
            valid = false;
            break;
          }
          groupPaths.add(group.path);
          totalFiles += group.fileCount;
          totalLoc += group.totalLoc;
          totalTokens += group.totalTokens;
        }
        valid &&= totalFiles === tier1.totalFiles && totalLoc === tier1.totalLoc && totalTokens === tier1.totalTokens &&
          [...fileGroups.values()].every(group => groupPaths.has(group));
        if (valid) {
          for (const group of groups) {
            const targets = new Set<string>();
            for (const edge of group.imports) {
              if (edge === null || typeof edge !== 'object' || !groupPaths.has(edge.path) ||
                edge.path === group.path || targets.has(edge.path) || !Number.isSafeInteger(edge.fileCount) ||
                edge.fileCount <= 0 || edge.fileCount > group.fileCount) {
                valid = false;
                break;
              }
              targets.add(edge.path);
            }
            if (!valid) break;
          }
        }
      }
    }
  }
  if (!valid) throw new Error(`cached tier 1 JSON has an unusable tier ${TIER1_VERSION} schema: ${path}. ${recovery}`);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function createScoutCommand(): Command {
  return new Command('scout')
    .description('Codebase navigation: pre-process repomix pack into Tier 1 JSON for tdk-scout-runner agent')
    .option('--scope <dir>', 'directory to scout (XOR with --from-pack)')
    .option('--from-pack <file>', 'reuse existing repomix pack (XOR with --scope)')
    .option('--task-hint <str>', 'bias agent file scoring')
    .option('--sample-budget <n>', 'max files for tier 2 to sample (1-50)', '10')
    .option('--output <path>', 'output report path (default: cache dir)')
    .option('--force-refresh', 'rebuild tier 1 even if cache fresh', false)
    .option('--include <patterns>', 'comma-separated glob patterns passed through to repomix (scope mode only)')
    .option('--ignore <patterns>', 'comma-separated glob patterns passed through to repomix as exclusions (scope mode only)')
    .action((opts: Record<string, unknown>) => {
      try {
        const args = validateArgs({
          scope: opts['scope'] as string | undefined,
          fromPack: opts['fromPack'] as string | undefined,
          taskHint: opts['taskHint'] as string | undefined,
          sampleBudget: opts['sampleBudget'] as string | undefined,
          output: opts['output'] as string | undefined,
          forceRefresh: opts['forceRefresh'] as boolean | undefined,
          include: opts['include'] as string | undefined,
          ignore: opts['ignore'] as string | undefined,
        });
        const result = runScout(args);
        writeAgentJson(result);
      } catch (err) {
        process.stderr.write(`[tdk-scout] error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

if (import.meta.main) {
  createScoutCommand().parse();
}
