import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256File } from './checksum';
import { manifestPathFor } from './manifest-store';
import { normalizeTargetRelativePath } from './target-relative-path';
import { validateInstallPlanTargets } from './target-path-safety';
import { ALL_CONVERT_PARTS } from './convert-parts';
import type { ConvertPart, ConvertPartSelection } from './convert-parts';
import type { ConvertTargetFile, CodexTargetFile, MigrationReport } from './flat-claude-types';
import type { HookTargetPlatform } from './lib/harness-transform/hook-command';
import type { ConvertReconcilePlan, ReconcileItem } from './convert-reconcile-types';
import type {
  Collision,
  HarnessInstallManifest,
  InstallPlan,
  ManagedFile,
  PlannedRemoval,
  PlannedWrite,
} from './types';

export const CONVERT_FLAT_OWNER = 'convert-flat';

export interface ConvertReconcileHarness {
  harness: 'codex' | 'omp';
  targetDir: '.codex' | '.omp';
  settingsPath: '.codex/config.toml' | '.omp/config.yml';
  mergeTargets: Readonly<Record<string, true>>;
  adoptUnownedMergeTargets?: boolean;
}

const CODEX_HARNESS_SPEC: ConvertReconcileHarness = {
  harness: 'codex',
  targetDir: '.codex',
  settingsPath: '.codex/config.toml',
  mergeTargets: {
    '.codex/config.toml': true,
    '.codex/hooks.json': true,
  },
};

export const OMP_HARNESS_SPEC: ConvertReconcileHarness = {
  harness: 'omp',
  targetDir: '.omp',
  settingsPath: '.omp/config.yml',
  mergeTargets: {
    '.omp/config.yml': true,
  },
  adoptUnownedMergeTargets: true,
};

function nowIso(): string {
  return new Date().toISOString();
}

function targetPath(consumerRoot: string, targetRelativePath: string): string {
  return path.join(consumerRoot, normalizeTargetRelativePath(targetRelativePath));
}

function toManagedFile(file: ConvertTargetFile): ManagedFile {
  return {
    plugin: CONVERT_FLAT_OWNER,
    sourceRelativePath: file.sourceRelativePath,
    targetRelativePath: normalizeTargetRelativePath(file.targetRelativePath),
    sourceChecksum: file.sourceChecksum,
    installedChecksum: file.installedChecksum,
    part: file.part,
    managedRegionChecksum: file.managedRegionChecksum,
    sourcePresent: file.sourcePresent,
  };
}

function toWrite(
  consumerRoot: string,
  file: ConvertTargetFile,
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

function fileState(
  consumerRoot: string,
  file: ConvertTargetFile,
  previous?: ManagedFile,
  force = false,
  mergeTarget = false,
  adoptUnownedMergeTarget = false,
): {
  item: ReconcileItem;
  write?: PlannedWrite;
  nextManaged?: ManagedFile;
} {
  const targetRelativePath = normalizeTargetRelativePath(file.targetRelativePath);
  const target = targetPath(consumerRoot, targetRelativePath);
  const managed = file.unmanageAfterWrite ? undefined : toManagedFile(file);
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return { item: { action: 'conflict', targetRelativePath, reason: 'target is not a regular file', previous } };
    }
    const currentChecksum = sha256File(target);
    if (!previous) {
      if (file.unmanageAfterWrite && currentChecksum === file.installedChecksum) {
        return { item: { action: 'skip', targetRelativePath, reason: 'unmanaged merge target already matches desired content' } };
      }
      if (mergeTarget && adoptUnownedMergeTarget) {
        return {
          item: { action: 'update', targetRelativePath, reason: 'adopt unowned merge target' },
          write: toWrite(consumerRoot, file, 'update', currentChecksum),
          nextManaged: managed,
        };
      }
      if (!force) return { item: { action: 'conflict', targetRelativePath, reason: 'target exists outside convert-flat ownership' } };
      return {
        item: { action: 'update', targetRelativePath, reason: 'force overwrites unowned target' },
        write: toWrite(consumerRoot, file, 'update', currentChecksum),
        nextManaged: managed,
      };
    }
    if (
      mergeTarget &&
      previous.managedRegionChecksum !== undefined &&
      file.currentManagedRegionChecksum !== undefined
    ) {
      if (file.currentManagedRegionChecksum !== previous.managedRegionChecksum && !force) {
        return {
          item: { action: 'conflict', targetRelativePath, reason: 'managed region has user edits', previous },
          nextManaged: previous,
        };
      }
      if (currentChecksum !== file.installedChecksum) {
        return {
          item: { action: 'update', targetRelativePath, reason: 'managed region changed', previous },
          write: toWrite(consumerRoot, file, 'update', currentChecksum),
          nextManaged: managed,
        };
      }
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

  if (file.unmanageAfterWrite) {
    return {
      item: { action: 'skip', targetRelativePath, reason: 'unmanaged target already absent', previous },
    };
  }
  return {
    item: { action: previous ? 'update' : 'install', targetRelativePath, reason: previous ? 'managed target missing' : 'new convert-flat target', previous },
    write: toWrite(consumerRoot, file, previous ? 'update' : 'create'),
    nextManaged: managed,
  };
}

function staleState(
  consumerRoot: string,
  previous: ManagedFile,
  mergeTargets: Readonly<Record<string, true>>,
  force = false,
): {
  item: ReconcileItem;
  removal?: PlannedRemoval;
  keep?: ManagedFile;
} {
  if (mergeTargets[previous.targetRelativePath]) {
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

function reconcileCollision(consumerRoot: string, item: ReconcileItem): Collision {
  const reason = item.reason;
  const kind = reason.includes('outside convert-flat ownership')
    ? 'unmanaged-target-exists'
    : reason.includes('not a regular file')
      ? 'directory-file-conflict'
      : 'managed-drift';
  return {
    kind,
    path: targetPath(consumerRoot, item.targetRelativePath),
    plugin: CONVERT_FLAT_OWNER,
    message: `Convert-flat conflict at ${item.targetRelativePath}: ${reason}.`,
  };
}

export interface BuildConvertReconcilePlanInput {
  consumerRoot: string;
  desiredFiles: ConvertTargetFile[];
  previousManifest: HarnessInstallManifest;
  migrationReport: MigrationReport;
  harnessSpec: ConvertReconcileHarness;
  selection: ConvertPartSelection;
  hookTargetPlatform?: HookTargetPlatform;
  force?: boolean;
}

export function buildConvertReconcilePlan(params: BuildConvertReconcilePlanInput): ConvertReconcilePlan {
  if (params.previousManifest.harness !== params.harnessSpec.harness) {
    throw new Error(`Expected ${params.harnessSpec.harness} manifest, received ${params.previousManifest.harness}.`);
  }
  if (
    params.harnessSpec.harness === 'omp'
    && params.selection.selectedParts.includes('hooks')
    && params.hookTargetPlatform === undefined
  ) {
    throw new Error('OMP hook reconciliation requires a resolved target platform.');
  }
  const desiredByTarget = new Map(params.desiredFiles.map((file) => [normalizeTargetRelativePath(file.targetRelativePath), file]));
  const previousOwned = params.previousManifest.managedFiles.filter((file) => file.plugin === CONVERT_FLAT_OWNER);
  const previousOwnedByTarget = new Map(previousOwned.map((file) => [normalizeTargetRelativePath(file.targetRelativePath), file]));
  const previousOther = params.previousManifest.managedFiles.filter((file) => file.plugin !== CONVERT_FLAT_OWNER);
  const otherTargets = new Set(previousOther.map((file) => normalizeTargetRelativePath(file.targetRelativePath)));
  const writes: PlannedWrite[] = [];
  const removals: PlannedRemoval[] = [];
  const items: ReconcileItem[] = [];
  const nextOwned = new Map<string, ManagedFile>();
  const removalScope = new Set<ConvertPart>([
    ...params.selection.selectedParts,
    ...params.selection.removedParts,
  ]);
  const force = Boolean(params.force);

  for (const file of params.desiredFiles) {
    const targetRelativePath = normalizeTargetRelativePath(file.targetRelativePath);
    const mergeTarget = Boolean(params.harnessSpec.mergeTargets[targetRelativePath]);
    if (mergeTarget && file.part !== undefined) {
      throw new Error(`Desired shared merge target ${targetRelativePath} must not declare a part owner.`);
    }
    if (otherTargets.has(targetRelativePath)) {
      const item = { action: 'conflict' as const, targetRelativePath, reason: 'target is owned by another manifest entry' };
      items.push(item);
      continue;
    }
    const state = fileState(
      params.consumerRoot,
      file,
      previousOwnedByTarget.get(targetRelativePath),
      force,
      mergeTarget,
      Boolean(params.harnessSpec.adoptUnownedMergeTargets),
    );
    items.push(state.item);
    if (state.write) writes.push(state.write);
    if (state.nextManaged) nextOwned.set(targetRelativePath, state.nextManaged);
  }

  for (const previous of previousOwned) {
    const targetRelativePath = normalizeTargetRelativePath(previous.targetRelativePath);
    if (desiredByTarget.has(targetRelativePath)) continue;
    if (previous.part && !removalScope.has(previous.part)) {
      nextOwned.set(targetRelativePath, previous);
      continue;
    }
    const state = staleState(params.consumerRoot, previous, params.harnessSpec.mergeTargets, force);
    items.push(state.item);
    if (state.removal) removals.push(state.removal);
    if (state.keep) nextOwned.set(targetRelativePath, state.keep);
  }

  const conflicts = items.filter((item) => item.action === 'conflict');
  const collisions = params.harnessSpec.harness === 'omp'
    ? conflicts.map((item) => reconcileCollision(params.consumerRoot, item))
    : [];

  const hookTargetPlatform = params.harnessSpec.harness !== 'omp' || params.selection.removedParts.includes('hooks')
    ? undefined
    : params.selection.selectedParts.includes('hooks')
      ? params.hookTargetPlatform
      : params.previousManifest.hookTargetPlatform;
  const nextManifest: HarnessInstallManifest = {
    version: 1,
    harness: params.harnessSpec.harness,
    selectedPlugins: [...new Set([...params.previousManifest.selectedPlugins, CONVERT_FLAT_OWNER])].sort(),
    installerVersion: '0.1.0',
    installedAt: nowIso(),
    managedFiles: [
      ...previousOther,
      ...nextOwned.values(),
    ].sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    managedHooks: params.previousManifest.managedHooks,
    ...(params.harnessSpec.harness === 'omp'
      ? { convertedParts: [...params.selection.activeParts] }
      : {}),
    ...(hookTargetPlatform === undefined ? {} : { hookTargetPlatform }),
  };

  const installPlan: InstallPlan = {
    harness: params.harnessSpec.harness,
    consumerRoot: params.consumerRoot,
    selectedPlugins: [CONVERT_FLAT_OWNER],
    targetDir: params.harnessSpec.targetDir,
    claudeSettingsPath: params.harnessSpec.settingsPath,
    manifestPath: manifestPathFor(params.consumerRoot, params.harnessSpec.harness),
    writes: writes.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    removals: removals.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    hookMutations: [],
    collisions,
    prompts: [],
    warnings: params.migrationReport.warnings,
    nextManifest,
    settingsChanged: false,
    installSettingsChanged: false,
    operationStamp: nowIso().replace(/[:.]/g, '-'),
    ...(params.harnessSpec.harness === 'omp' && desiredByTarget.has('.omp/config.yml')
      ? { durableBackupRoots: ['.omp'] }
      : {}),
  };
  validateInstallPlanTargets(installPlan);
  return {
    consumerRoot: params.consumerRoot,
    manifestPath: installPlan.manifestPath,
    items: items.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    installPlan,
    conflicts,
    warnings: params.migrationReport.warnings,
  };
}

export function buildCodexReconcilePlan(params: {
  consumerRoot: string;
  desiredFiles: CodexTargetFile[];
  previousManifest: HarnessInstallManifest;
  migrationReport: MigrationReport;
  force?: boolean;
}): ConvertReconcilePlan {
  return buildConvertReconcilePlan({
    ...params,
    harnessSpec: CODEX_HARNESS_SPEC,
    selection: {
      selectedParts: [...ALL_CONVERT_PARTS],
      removedParts: [],
      activeParts: [...ALL_CONVERT_PARTS],
    },
  });
}

export function renderConvertReconcilePlan(plan: ConvertReconcilePlan): string {
  const counts = new Map<string, number>();
  for (const item of plan.items) counts.set(item.action, (counts.get(item.action) ?? 0) + 1);
  const harnessLabel = plan.installPlan.harness === 'codex' ? 'Codex' : 'OMP';
  const lines = [
    `${harnessLabel} convert-flat reconcile plan`,
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
