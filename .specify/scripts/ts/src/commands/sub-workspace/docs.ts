// CLI: tdk sub-workspace docs --sub-workspace NAME | --all [--force]
// Validates args, resolves sub-workspace targets, packs each via repomix, detects mode.
// Emits a single JSON envelope on stdout. All progress logs go to stderr.

import { Command } from 'commander';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { detectConfig, subWorkspaceDocsDir, writeAgentJson } from '../../utils/index';
import {
  DocsError,
  EXPECTED_DOC_FILES,
  type DocsEnvelope,
  type DocsMode,
  type DocsTarget,
} from './types';
import { ensureRepomixOnPath, runRepomixPack } from './repomix-pack';

export type DocsArgs = {
  subWorkspace?: string;
  all?: boolean;
  force?: boolean;
};

type ResolvedArgs =
  | { mode: 'single'; name: string; force: boolean }
  | { mode: 'all'; force: boolean };

export function validateDocsArgs(args: DocsArgs): ResolvedArgs {
  const hasName = typeof args.subWorkspace === 'string' && args.subWorkspace.length > 0;
  const hasAll = !!args.all;
  if (hasName && hasAll) {
    throw new DocsError('INVALID_ARGS', '--sub-workspace and --all are mutually exclusive');
  }
  if (!hasName && !hasAll) {
    throw new DocsError('NO_ARGS', 'one of --sub-workspace <name> or --all is required');
  }
  if (hasName) {
    return { mode: 'single', name: args.subWorkspace!, force: !!args.force };
  }
  return { mode: 'all', force: !!args.force };
}

type RawTarget = { name: string; wsPath: string; absRoot: string; outputDir: string };

export function resolveTargets(
  resolved: ResolvedArgs,
  cwd?: string,
): { workspaceRoot: string; docsPath: string; targets: RawTarget[] } {
  const cfg = detectConfig({ cwd });
  if (!cfg.configFound) {
    throw new DocsError('CONFIG_NOT_FOUND', 'No .specify config found in ancestor directories');
  }
  const list = cfg.subWorkspaces;
  if (list.length === 0) {
    throw new DocsError(
      'EMPTY_CONFIG',
      'No sub-workspaces configured. Run /tdk-sub-workspace-init first.',
    );
  }

  const selected =
    resolved.mode === 'all'
      ? list
      : (() => {
          const found = list.find(sw => sw.name === resolved.name);
          if (!found) {
            const available = list.map(s => s.name).join(', ');
            throw new DocsError(
              'UNKNOWN_SW',
              `Sub-workspace "${resolved.name}" not found. Available: ${available}`,
            );
          }
          return [found];
        })();

  const targets: RawTarget[] = selected.map(sw => {
    const absRoot = resolve(cfg.workspaceRoot, sw.path);
    if (!existsSync(absRoot)) {
      throw new DocsError(
        'MISSING_PATH',
        `Sub-workspace "${sw.name}" path "${sw.path}" does not exist on disk`,
      );
    }
    const outputDir = subWorkspaceDocsDir(cfg.workspaceRoot, cfg.docsPath, sw.name);
    return { name: sw.name, wsPath: sw.path, absRoot, outputDir };
  });

  return { workspaceRoot: cfg.workspaceRoot, docsPath: cfg.docsPath, targets };
}

export function scanExistingDocs(outputDir: string): string[] {
  if (!existsSync(outputDir)) return [];
  const entries = readdirSync(outputDir, { withFileTypes: true });
  const present = new Set(entries.filter(e => e.isFile()).map(e => e.name));
  return EXPECTED_DOC_FILES.filter(f => present.has(f));
}

export function computeMode(existingFiles: string[], force: boolean): DocsMode {
  if (force) return 'force';
  return existingFiles.length === 0 ? 'init' : 'update';
}

export type RunDocsDeps = {
  ensureBin?: typeof ensureRepomixOnPath;
  pack?: typeof runRepomixPack;
};

export function runDocs(args: DocsArgs, deps: RunDocsDeps = {}, cwd?: string): DocsEnvelope {
  let resolved: ResolvedArgs;
  try {
    resolved = validateDocsArgs(args);
  } catch (e) {
    if (e instanceof DocsError) return { ok: false, error: e.message, code: e.code };
    throw e;
  }

  let plan: ReturnType<typeof resolveTargets>;
  try {
    plan = resolveTargets(resolved, cwd);
  } catch (e) {
    if (e instanceof DocsError) return { ok: false, error: e.message, code: e.code };
    throw e;
  }

  const ensureBin = deps.ensureBin ?? ensureRepomixOnPath;
  const pack = deps.pack ?? runRepomixPack;

  try {
    ensureBin();
  } catch (e) {
    if (e instanceof DocsError) return { ok: false, error: e.message, code: e.code };
    throw e;
  }

  const cacheDir = resolve(plan.workspaceRoot, '.specify/cache/tdk-docs');
  const targets: DocsTarget[] = [];
  const warnings: string[] = [];

  for (const t of plan.targets) {
    const packedFile = join(cacheDir, `${t.name}.md`);
    let tokenCount = -1;
    try {
      const r = pack({ scope: t.absRoot, outputPath: packedFile });
      tokenCount = r.tokenCount;
    } catch (e) {
      if (e instanceof DocsError) return { ok: false, error: e.message, code: e.code };
      throw e;
    }
    if (tokenCount > 100_000) {
      warnings.push(`${t.name}: pack >${100_000} tokens (${tokenCount}); consider narrowing the sub-workspace root, or pack a subset with 'tdk scout --scope <dir> --include <patterns>'`);
    }
    const existingFiles = scanExistingDocs(t.outputDir);
    targets.push({
      name: t.name,
      wsPath: t.wsPath,
      outputDir: t.outputDir,
      packedFile,
      tokenCount,
      mode: computeMode(existingFiles, resolved.force),
      existingFiles,
    });
  }

  return {
    ok: true,
    targets,
    cleanupCandidates: [cacheDir],
    warnings,
  };
}

export function createDocsCommand(): Command {
  return new Command('docs')
    .description(
      'Pack each target sub-workspace via repomix and emit JSON plan for tdk-docs-writer agent.',
    )
    .option('--sub-workspace <name>', 'target single sub-workspace by name')
    .option('--all', 'target every entry in config.subWorkspaces[]', false)
    .option('--force', 'force overwrite mode for all targets', false)
    .action((opts: Record<string, unknown>) => {
      const envelope = runDocs({
        subWorkspace: opts['subWorkspace'] as string | undefined,
        all: opts['all'] as boolean | undefined,
        force: opts['force'] as boolean | undefined,
      });
      writeAgentJson(envelope);
      if (!envelope.ok) process.exit(1);
    });
}

if (import.meta.main) {
  createDocsCommand().parse();
}
