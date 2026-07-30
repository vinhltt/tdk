// tdk-scout CLI: parse args → repomix (if --scope) → Tier 1 extract → emit JSON contract on stdout.
// Stdout is reserved for the final JSON line (parsed by SKILL.md downstream).
// All logs/progress go to stderr.

import { Command } from 'commander';
import { readFileSync, statSync } from 'node:fs';
import { validateArgs, type ResolvedArgs } from './args-validator';
import { resolveCachePaths, isTier1CacheValid } from './cache-resolver';
import { runRepomix } from './repomix-runner';
import { extractPack } from './extract';
import { writeAgentJson } from '../../utils/index';

// Hard ceiling on how many files one scout run may hand to the tier 2 agent.
// That agent loads the whole Tier 1 JSON into context before it reads anything, and on this
// codebase a Tier 1 entry costs roughly 300-800 bytes per file, so a ~50K-token working
// budget is really used up somewhere between 250 and 550 files. 800 sits deliberately above
// that band so that scouting this toolkit's own workspace (681 files) is not blocked. Treat
// it as a backstop against runaway repos, not as a guarantee that a passing report fits the
// agent's budget.
const MAX_SCOUT_FILES = 800;

// Advisory-only pack size. The Tier 1 JSON is much smaller than the pack it came from, but
// the ratio is unstable: the densest case measured on this codebase was ~0.20x the pack size,
// while other repos came in as low as 0.03x. A pack past this size can therefore produce a
// Tier 1 JSON beyond the agent's budget, but often will not — so this only warns, and the
// exact file-count check runs right after it.
const PACK_SIZE_WARN_BYTES = 1_000_000;

export interface Tier1Summary {
  totalFiles: number;
}

/**
 * Reads the file count out of an already-written Tier 1 JSON (used on the cache-hit path).
 *
 * A cached JSON with no usable count cannot be checked against the ceiling, so this refuses
 * rather than substituting a default. Treating a missing count as zero would let a cached
 * report skip the ceiling check entirely — the silent pass this check exists to prevent.
 */
export function readTier1Summary(tier1JsonPath: string): Tier1Summary {
  const parsed = JSON.parse(readFileSync(tier1JsonPath, 'utf-8')) as { totalFiles?: unknown };
  if (typeof parsed.totalFiles !== 'number' || !Number.isFinite(parsed.totalFiles)) {
    throw new Error(
      `cached tier 1 JSON has no usable totalFiles: ${tier1JsonPath}. ` +
      'Re-run with --force-refresh to rebuild it.',
    );
  }
  return { totalFiles: parsed.totalFiles };
}

export interface RunDeps {
  runRepomix?: typeof runRepomix;
  extractPack?: typeof extractPack;
  isTier1CacheValid?: typeof isTier1CacheValid;
  readTier1Summary?: typeof readTier1Summary;
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
  const isCacheValid = deps.isTier1CacheValid ?? isTier1CacheValid;
  const readSummary = deps.readTier1Summary ?? readTier1Summary;

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
  if (!args.forceRefresh && isCacheValid(paths.tier1JsonPath, packPath)) {
    process.stderr.write('[tdk-scout] tier 1 cache hit\n');
    cacheHit = true;
    assertWithinFileCeiling(readSummary(paths.tier1JsonPath).totalFiles);
  } else {
    process.stderr.write('[tdk-scout] running tier 1 extract\n');
    const tier1 = extract(packPath, paths.tier1JsonPath, { scope: args.scopeKey });
    assertWithinFileCeiling(tier1.totalFiles);
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

/** Approximate early signal on pack size. Never fatal — the file-count check decides. */
function warnOnLargePack(packPath: string): void {
  const packBytes = statSync(packPath).size;
  if (packBytes <= PACK_SIZE_WARN_BYTES) return;
  process.stderr.write(
    `[tdk-scout] warning: pack is ${packBytes} bytes (> ${PACK_SIZE_WARN_BYTES}); ` +
    'the tier 1 report may be too large for the tier 2 agent. ' +
    'This is approximate — the exact file-count check follows.\n',
  );
}

/** Single ceiling check shared by the cache-hit and fresh-extract paths so they cannot drift. */
function assertWithinFileCeiling(totalFiles: number): void {
  if (totalFiles <= MAX_SCOUT_FILES) return;
  throw new Error(
    `scope too large for tier 2: ${totalFiles} files exceeds the limit of ${MAX_SCOUT_FILES}. ` +
    'Re-run with --scope <subdir> to narrow the scope (or --include <patterns> to pack a subset).',
  );
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
