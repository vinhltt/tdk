// tdk-scout CLI: parse args → repomix (if --scope) → Tier 1 extract → emit JSON contract on stdout.
// Stdout is reserved for the final JSON line (parsed by SKILL.md downstream).
// All logs/progress go to stderr.

import { Command } from 'commander';
import { validateArgs, type ResolvedArgs } from './args-validator';
import { resolveCachePaths, isTier1CacheValid } from './cache-resolver';
import { runRepomix } from './repomix-runner';
import { extractPack } from './extract';

export interface RunDeps {
  runRepomix?: typeof runRepomix;
  extractPack?: typeof extractPack;
  isTier1CacheValid?: typeof isTier1CacheValid;
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

  const packPathOverride = args.mode === 'from-pack' ? args.packPath : undefined;
  const paths = resolveCachePaths({
    scopeKey: args.scopeKey,
    packPathOverride,
    outputPathOverride: args.output,
  });

  let packPath: string;
  if (args.mode === 'scope') {
    process.stderr.write(`[tdk-scout] running repomix on ${args.scope}\n`);
    packPath = repomix({ scope: args.scope!, outputPath: paths.packPath });
  } else {
    packPath = paths.packPath;
  }

  let cacheHit = false;
  if (!args.forceRefresh && isCacheValid(paths.tier1JsonPath, packPath)) {
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

export function createScoutCommand(): Command {
  return new Command('scout')
    .description('Codebase navigation: pre-process repomix pack into Tier 1 JSON for tdk-scout-runner agent')
    .option('--scope <dir>', 'directory to scout (XOR with --from-pack)')
    .option('--from-pack <file>', 'reuse existing repomix pack (XOR with --scope)')
    .option('--task-hint <str>', 'bias agent file scoring')
    .option('--sample-budget <n>', 'max files for tier 2 to sample (1-50)', '10')
    .option('--output <path>', 'output report path (default: cache dir)')
    .option('--force-refresh', 'rebuild tier 1 even if cache fresh', false)
    .action((opts: Record<string, unknown>) => {
      try {
        const args = validateArgs({
          scope: opts['scope'] as string | undefined,
          fromPack: opts['fromPack'] as string | undefined,
          taskHint: opts['taskHint'] as string | undefined,
          sampleBudget: opts['sampleBudget'] as string | undefined,
          output: opts['output'] as string | undefined,
          forceRefresh: opts['forceRefresh'] as boolean | undefined,
        });
        const result = runScout(args);
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } catch (err) {
        process.stderr.write(`[tdk-scout] error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });
}

if (import.meta.main) {
  createScoutCommand().parse();
}
