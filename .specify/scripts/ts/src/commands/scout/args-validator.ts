// Validates raw commander options into a normalized ResolvedArgs.
// Throws Error on contract violation (caught at top-level CLI handler).

import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';

export interface RawOpts {
  scope?: string;
  fromPack?: string;
  taskHint?: string;
  sampleBudget?: string | number;
  output?: string;
  forceRefresh?: boolean;
  include?: string;
  ignore?: string;
}

export interface ResolvedArgs {
  mode: 'scope' | 'from-pack';
  scope?: string;
  packPath?: string;
  taskHint: string;
  sampleBudget: number;
  output?: string;
  forceRefresh: boolean;
  scopeKey: string;
  include?: string[];
  ignore?: string[];
}

const DEFAULT_TASK_HINT = 'general codebase navigation';
const DEFAULT_SAMPLE_BUDGET = 10;
const SAMPLE_BUDGET_MIN = 1;
const SAMPLE_BUDGET_MAX = 50;

export function validateArgs(opts: RawOpts): ResolvedArgs {
  const hasScope = !!opts.scope;
  const hasFromPack = !!opts.fromPack;

  if (hasScope && hasFromPack) {
    throw new Error('--scope and --from-pack are mutually exclusive');
  }
  if (!hasScope && !hasFromPack) {
    throw new Error('exactly one of --scope or --from-pack is required');
  }
  // Patterns only steer the repomix run; a pack passed to --from-pack is already built,
  // so filtering it would do nothing. Rejected on raw presence, before normalization.
  if (hasFromPack && (opts.include !== undefined || opts.ignore !== undefined)) {
    throw new Error(
      '--include/--ignore cannot be combined with --from-pack: the pack is already built, ' +
      'so filtering it has no effect. Re-pack with --scope <dir> --include/--ignore, ' +
      'or narrow the existing pack via --scope instead.',
    );
  }

  const sampleBudget = parseSampleBudget(opts.sampleBudget);
  const taskHint = opts.taskHint?.trim() || DEFAULT_TASK_HINT;
  const forceRefresh = !!opts.forceRefresh;

  if (hasScope) {
    const scope = resolve(opts.scope!);
    return {
      mode: 'scope',
      scope,
      taskHint,
      sampleBudget,
      output: opts.output,
      forceRefresh,
      scopeKey: deriveScopeKey(scope),
      include: parsePatterns(opts.include),
      ignore: parsePatterns(opts.ignore),
    };
  }

  const packPath = resolve(opts.fromPack!);
  if (!existsSync(packPath)) {
    throw new Error(`pack file not found: ${packPath}`);
  }
  return {
    mode: 'from-pack',
    packPath,
    taskHint,
    sampleBudget,
    output: opts.output,
    forceRefresh,
    scopeKey: basename(packPath, '.md'),
  };
}

function parseSampleBudget(raw: string | number | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_SAMPLE_BUDGET;
  const n = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`--sample-budget must be a number, got: ${String(raw)}`);
  }
  if (n < SAMPLE_BUDGET_MIN || n > SAMPLE_BUDGET_MAX) {
    throw new Error(
      `--sample-budget must be between ${SAMPLE_BUDGET_MIN} and ${SAMPLE_BUDGET_MAX}`,
    );
  }
  return n;
}

/** Comma-separated glob list → trimmed entries; undefined when nothing usable remains. */
function parsePatterns(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const patterns = raw.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  return patterns.length > 0 ? patterns : undefined;
}

function deriveScopeKey(scopePath: string): string {
  const base = basename(scopePath);
  return base.replace(/[^\w.-]/g, '_') || 'root';
}
