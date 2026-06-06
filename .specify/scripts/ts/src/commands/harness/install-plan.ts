import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256File } from './checksum';
import { classifyFile } from './file-write-plan';
import { buildHookMerge } from './hook-merge';
import { planLegacyHooksJsonInspection } from './legacy-hooks-json-cleanup';
import type {
  BuildPlanInput,
  Collision,
  HarnessInstallManifest,
  InstallPlan,
  ManagedFile,
  PlannedRemoval,
  PlannedWrite,
  RequiredPrompt,
} from './types';

function nowIso(): string {
  return new Date().toISOString();
}

function byTarget<T extends { targetRelativePath: string }>(a: T, b: T): number {
  return a.targetRelativePath.localeCompare(b.targetRelativePath);
}

function targetPath(consumerRoot: string, targetRelativePath: string): string {
  return path.join(consumerRoot, targetRelativePath);
}

function previousByTarget(previous: ManagedFile[]): Map<string, ManagedFile> {
  return new Map(previous.map((file) => [file.targetRelativePath, file]));
}

function planRemovals(consumerRoot: string, previous: HarnessInstallManifest, desiredTargets: Set<string>): { removals: PlannedRemoval[]; collisions: Collision[] } {
  const removals: PlannedRemoval[] = [];
  const collisions: Collision[] = [];

  for (const oldFile of previous.managedFiles) {
    if (desiredTargets.has(oldFile.targetRelativePath)) continue;
    const currentPath = targetPath(consumerRoot, oldFile.targetRelativePath);
    if (!fs.existsSync(currentPath)) continue;
    const stat = fs.lstatSync(currentPath);
    if (!stat.isFile()) {
      collisions.push({ kind: 'directory-file-conflict', path: currentPath, message: `Managed target is not a file: ${oldFile.targetRelativePath}` });
      continue;
    }
    const currentChecksum = sha256File(currentPath);
    if (currentChecksum !== oldFile.installedChecksum) {
      collisions.push({ kind: 'managed-drift', path: currentPath, message: `Deselected managed file drifted and will not be removed: ${oldFile.targetRelativePath}` });
      continue;
    }
    removals.push({ targetPath: currentPath, targetRelativePath: oldFile.targetRelativePath, previous: oldFile });
  }

  return { removals: removals.sort(byTarget), collisions };
}

export function buildClaudeInstallPlan(input: BuildPlanInput): InstallPlan {
  const previous = input.previousManifest;
  const previousMap = previousByTarget(previous.managedFiles);
  const writes: PlannedWrite[] = [];
  const collisions: Collision[] = [];
  const prompts: RequiredPrompt[] = [];
  const warnings: string[] = [];
  const desiredTargets = new Set<string>();
  const selectedFiles = input.plugins.flatMap((plugin) => plugin.files);

  for (const file of selectedFiles) {
    desiredTargets.add(file.targetRelativePath);
    const result = classifyFile({ consumerRoot: input.consumerRoot, file, previous: previousMap.get(file.targetRelativePath) });
    if (result.write) writes.push(result.write);
    if (result.collision) collisions.push(result.collision);
    if (result.prompt) prompts.push(result.prompt);
  }

  const removalPlan = planRemovals(input.consumerRoot, previous, desiredTargets);
  collisions.push(...removalPlan.collisions);
  const legacyHooksJsonPlan = planLegacyHooksJsonInspection(input, previousMap);
  collisions.push(...legacyHooksJsonPlan.collisions);
  prompts.push(...legacyHooksJsonPlan.prompts);
  warnings.push(...legacyHooksJsonPlan.warnings);

  const pluginRoots = new Map(input.plugins.map((plugin) => [plugin.name, plugin.root]));
  const hookMerge = buildHookMerge({
    consumerRoot: input.consumerRoot,
    selectedPlugins: input.selectedPlugins,
    pluginRoots,
    previousHooks: previous.managedHooks,
    settings: input.settings,
  });
  collisions.push(...hookMerge.collisions);

  const managedFiles: ManagedFile[] = selectedFiles.map((file) => ({
    plugin: file.plugin,
    sourceRelativePath: file.sourceRelativePath,
    targetRelativePath: file.targetRelativePath,
    sourceChecksum: file.sourceChecksum,
    installedChecksum: file.sourceChecksum,
  })).sort(byTarget);

  const nextManifest: HarnessInstallManifest = {
    version: 1,
    harness: 'claude',
    selectedPlugins: [...input.selectedPlugins].sort(),
    installerVersion: '0.1.0',
    installedAt: nowIso(),
    managedFiles,
    managedHooks: hookMerge.managedHooks,
  };

  return {
    harness: 'claude',
    consumerRoot: input.consumerRoot,
    selectedPlugins: [...input.selectedPlugins].sort(),
    writes: writes.sort(byTarget),
    removals: removalPlan.removals,
    hookMutations: hookMerge.mutations,
    collisions,
    prompts,
    warnings,
    nextManifest,
    nextSettings: hookMerge.nextSettings,
    settingsChanged: hookMerge.settingsChanged,
  };
}
