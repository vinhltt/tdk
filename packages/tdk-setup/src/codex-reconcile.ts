import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256File } from './checksum';
import { manifestPathFor } from './manifest-store';
import { normalizeTargetRelativePath } from './target-relative-path';
import type { CodexTargetFile, MigrationReport } from './flat-claude-types';
import type { CodexReconcilePlan, ReconcileItem } from './codex-reconcile-types';
import type {
  HarnessInstallManifest,
  InstallPlan,
  ManagedFile,
  PlannedRemoval,
  PlannedWrite,
} from './types';

const CONVERT_FLAT_OWNER = 'convert-flat';
const MERGE_TARGETS = new Set(['.codex/config.toml', '.codex/hooks.json']);

function nowIso(): string {
  return new Date().toISOString();
}

function targetPath(consumerRoot: string, targetRelativePath: string): string {
  return path.join(consumerRoot, normalizeTargetRelativePath(targetRelativePath));
}

function toManagedFile(file: CodexTargetFile): ManagedFile {
  return {
    plugin: CONVERT_FLAT_OWNER,
    sourceRelativePath: file.sourceRelativePath,
    targetRelativePath: normalizeTargetRelativePath(file.targetRelativePath),
    sourceChecksum: file.sourceChecksum,
    installedChecksum: file.installedChecksum,
  };
}

function toWrite(
  consumerRoot: string,
  file: CodexTargetFile,
  action: 'create' | 'update',
  expectedTargetChecksum?: string,
): PlannedWrite {
  return {
    plugin: CONVERT_FLAT_OWNER,
    sourcePath: file.sourcePath,
    sourceRelativePath: file.sourceRelativePath,
    targetPath: targetPath(consumerRoot, file.targetRelativePath),
    targetRelativePath: normalizeTargetRelativePath(file.targetRelativePath),
    sourceChecksum: file.sourceChecksum,
    installedChecksum: file.installedChecksum,
    content: file.content,
    expectedTargetChecksum,
    action,
  };
}

function fileState(consumerRoot: string, file: CodexTargetFile, previous?: ManagedFile, force = false): {
  item: ReconcileItem;
  write?: PlannedWrite;
  nextManaged?: ManagedFile;
} {
  const targetRelativePath = normalizeTargetRelativePath(file.targetRelativePath);
  const target = targetPath(consumerRoot, targetRelativePath);
  const managed = toManagedFile(file);
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return { item: { action: 'conflict', targetRelativePath, reason: 'target is not a regular file', previous } };
    }
    const currentChecksum = sha256File(target);
    if (!previous) {
      if (!force) return { item: { action: 'conflict', targetRelativePath, reason: 'target exists outside convert-flat ownership' } };
      return {
        item: { action: 'update', targetRelativePath, reason: 'force overwrites unowned target' },
        write: toWrite(consumerRoot, file, 'update', currentChecksum),
        nextManaged: managed,
      };
    }
    if (currentChecksum === file.installedChecksum) {
      return { item: { action: 'skip', targetRelativePath, reason: 'target already matches desired content', previous }, nextManaged: managed };
    }
    if (currentChecksum === previous.installedChecksum) {
      return {
        item: { action: 'update', targetRelativePath, reason: 'managed source changed', previous },
        write: toWrite(consumerRoot, file, 'update', currentChecksum),
        nextManaged: managed,
      };
    }
    if (!force) {
      return { item: { action: 'conflict', targetRelativePath, reason: 'managed target has user edits', previous }, nextManaged: previous };
    }
    return {
      item: { action: 'update', targetRelativePath, reason: 'force overwrites managed drift', previous },
      write: toWrite(consumerRoot, file, 'update', currentChecksum),
      nextManaged: managed,
    };
  }

  return {
    item: { action: previous ? 'update' : 'install', targetRelativePath, reason: previous ? 'managed target missing' : 'new convert-flat target', previous },
    write: toWrite(consumerRoot, file, previous ? 'update' : 'create'),
    nextManaged: managed,
  };
}

function staleState(consumerRoot: string, previous: ManagedFile, force = false): {
  item: ReconcileItem;
  removal?: PlannedRemoval;
  keep?: ManagedFile;
} {
  if (MERGE_TARGETS.has(previous.targetRelativePath)) {
    return {
      item: {
        action: 'conflict',
        targetRelativePath: previous.targetRelativePath,
        reason: 'merge target retained; remove convert-flat entries manually if no longer desired',
        previous,
      },
      keep: previous,
    };
  }
  const target = targetPath(consumerRoot, previous.targetRelativePath);
  if (!fs.existsSync(target)) {
    return { item: { action: 'skip', targetRelativePath: previous.targetRelativePath, reason: 'stale owned target already absent', previous } };
  }
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return { item: { action: 'conflict', targetRelativePath: previous.targetRelativePath, reason: 'stale target is not a regular file', previous }, keep: previous };
  }
  const currentChecksum = sha256File(target);
  if (currentChecksum !== previous.installedChecksum && !force) {
    return { item: { action: 'conflict', targetRelativePath: previous.targetRelativePath, reason: 'stale owned target has user edits', previous }, keep: previous };
  }
  return {
    item: { action: 'delete', targetRelativePath: previous.targetRelativePath, reason: force ? 'force removes stale owned target' : 'stale convert-flat owned target', previous },
    removal: { targetPath: target, targetRelativePath: previous.targetRelativePath, previous },
  };
}

export function buildCodexReconcilePlan(params: {
  consumerRoot: string;
  desiredFiles: CodexTargetFile[];
  previousManifest: HarnessInstallManifest;
  migrationReport: MigrationReport;
  force?: boolean;
}): CodexReconcilePlan {
  const desiredByTarget = new Map(params.desiredFiles.map((file) => [normalizeTargetRelativePath(file.targetRelativePath), file]));
  const previousOwned = params.previousManifest.managedFiles.filter((file) => file.plugin === CONVERT_FLAT_OWNER);
  const previousOwnedByTarget = new Map(previousOwned.map((file) => [normalizeTargetRelativePath(file.targetRelativePath), file]));
  const previousOther = params.previousManifest.managedFiles.filter((file) => file.plugin !== CONVERT_FLAT_OWNER);
  const otherTargets = new Set(previousOther.map((file) => normalizeTargetRelativePath(file.targetRelativePath)));
  const writes: PlannedWrite[] = [];
  const removals: PlannedRemoval[] = [];
  const items: ReconcileItem[] = [];
  const nextOwned = new Map<string, ManagedFile>();
  const force = Boolean(params.force);

  for (const file of params.desiredFiles) {
    const targetRelativePath = normalizeTargetRelativePath(file.targetRelativePath);
    if (otherTargets.has(targetRelativePath)) {
      const item = { action: 'conflict' as const, targetRelativePath, reason: 'target is owned by another manifest entry' };
      items.push(item);
      continue;
    }
    const state = fileState(params.consumerRoot, file, previousOwnedByTarget.get(targetRelativePath), force);
    items.push(state.item);
    if (state.write) writes.push(state.write);
    if (state.nextManaged) nextOwned.set(targetRelativePath, state.nextManaged);
  }

  for (const previous of previousOwned) {
    const targetRelativePath = normalizeTargetRelativePath(previous.targetRelativePath);
    if (desiredByTarget.has(targetRelativePath)) continue;
    const state = staleState(params.consumerRoot, previous, force);
    items.push(state.item);
    if (state.removal) removals.push(state.removal);
    if (state.keep) nextOwned.set(targetRelativePath, state.keep);
  }

  const nextManifest: HarnessInstallManifest = {
    version: 1,
    harness: 'codex',
    selectedPlugins: [...new Set([...params.previousManifest.selectedPlugins, CONVERT_FLAT_OWNER])].sort(),
    installerVersion: '0.1.0',
    installedAt: nowIso(),
    managedFiles: [
      ...previousOther,
      ...[...nextOwned.values()],
    ].sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    managedHooks: params.previousManifest.managedHooks,
  };

  const installPlan: InstallPlan = {
    harness: 'codex',
    consumerRoot: params.consumerRoot,
    selectedPlugins: [CONVERT_FLAT_OWNER],
    targetDir: '.codex',
    claudeSettingsPath: '.codex/config.toml',
    manifestPath: manifestPathFor(params.consumerRoot, 'codex'),
    writes: writes.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    removals: removals.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    hookMutations: [],
    collisions: [],
    prompts: [],
    warnings: params.migrationReport.warnings,
    nextManifest,
    settingsChanged: false,
    installSettingsChanged: false,
  };
  const conflicts = items.filter((item) => item.action === 'conflict');
  return {
    consumerRoot: params.consumerRoot,
    manifestPath: installPlan.manifestPath,
    items: items.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    installPlan,
    conflicts,
    warnings: params.migrationReport.warnings,
  };
}

export function renderCodexReconcilePlan(plan: CodexReconcilePlan): string {
  const counts = new Map<string, number>();
  for (const item of plan.items) counts.set(item.action, (counts.get(item.action) ?? 0) + 1);
  const lines = [
    'Codex convert-flat reconcile plan',
    `Manifest: ${plan.manifestPath}`,
    `install: ${counts.get('install') ?? 0}`,
    `update: ${counts.get('update') ?? 0}`,
    `skip: ${counts.get('skip') ?? 0}`,
    `delete: ${counts.get('delete') ?? 0}`,
    `conflict: ${counts.get('conflict') ?? 0}`,
  ];
  for (const item of plan.items) {
    lines.push(`  ${item.action}: ${item.targetRelativePath} (${item.reason})`);
  }
  if (plan.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of plan.warnings) lines.push(`  - ${warning}`);
  }
  return `${lines.join('\n')}\n`;
}

export { CONVERT_FLAT_OWNER };
