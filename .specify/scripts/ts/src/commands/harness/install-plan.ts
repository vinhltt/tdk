import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256Buffer, sha256File } from './checksum';
import { classifyFile } from './file-write-plan';
import { buildHookMerge } from './hook-merge';
import { settingsPathFor } from './install-settings';
import { planLegacyHooksJsonInspection } from './legacy-hooks-json-cleanup';
import { manifestPathFor } from './manifest-store';
import { buildPrefixRewriteMap, transformFileContent, transformTargetRelativePath } from './prefix-transform';
import type {
  BuildPlanInput,
  Collision,
  DiscoveredPluginFile,
  HarnessInstallManifest,
  InstallPlan,
  ManagedFile,
  PlannedRemoval,
  PlannedWrite,
  RequiredPrompt,
  TransformedPluginFile,
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

function verifySourceBytes(file: DiscoveredPluginFile): Buffer {
  const stat = fs.lstatSync(file.sourcePath);
  if (stat.isSymbolicLink()) throw new Error(`Refusing symlinked plugin source file: ${file.sourceRelativePath}`);
  if (!stat.isFile()) throw new Error(`Plugin source is not a file: ${file.sourceRelativePath}`);
  const content = fs.readFileSync(file.sourcePath);
  if (sha256Buffer(content) !== file.sourceChecksum) {
    throw new Error(`Source checksum mismatch for ${file.sourceRelativePath}`);
  }
  return content;
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
  const targetDir = input.targetDir ?? '.claude';
  const claudeSettingsPath = input.settingsPath ?? path.join(targetDir, 'settings.json');
  const previousMap = previousByTarget(previous.managedFiles);
  const writes: PlannedWrite[] = [];
  const collisions: Collision[] = [];
  const prompts: RequiredPrompt[] = [];
  const warnings: string[] = [];
  const desiredTargets = new Set<string>();
  const transformSettings = {
    sourcePrefix: input.sourcePrefix ?? 'tdk-',
    targetPrefix: input.targetPrefix ?? 'tdk-',
  };
  const rewrite = input.rewrite ?? { paths: true, textFiles: true, hooks: true };
  const rewriteMap = buildPrefixRewriteMap(input.plugins, transformSettings);
  const selectedFiles: TransformedPluginFile[] = input.plugins.flatMap((plugin) => plugin.files.map((file) => {
    const sourceContent = verifySourceBytes(file);
    const targetRelativePath = rewrite.paths
      ? transformTargetRelativePath(file.targetRelativePath, transformSettings)
      : file.targetRelativePath;
    const content = rewrite.textFiles
      ? transformFileContent(file.sourcePath, sourceContent, rewriteMap)
      : sourceContent;
    if (sha256File(file.sourcePath) !== file.sourceChecksum) {
      throw new Error(`Source changed while planning: ${file.sourceRelativePath}`);
    }
    return {
      ...file,
      targetRelativePath,
      installedChecksum: sha256Buffer(content),
      content,
    };
  }));

  const seenTargets = new Map<string, TransformedPluginFile>();
  for (const file of selectedFiles) {
    const existing = seenTargets.get(file.targetRelativePath);
    if (existing) {
      collisions.push({
        kind: 'unmanaged-target-exists',
        path: targetPath(input.consumerRoot, file.targetRelativePath),
        plugin: file.plugin,
        message: `Duplicate transformed target path: ${file.targetRelativePath} from ${existing.plugin} and ${file.plugin}`,
      });
    } else {
      seenTargets.set(file.targetRelativePath, file);
    }
  }

  for (const file of selectedFiles) {
    desiredTargets.add(file.targetRelativePath);
    const result = classifyFile({
      consumerRoot: input.consumerRoot,
      targetDir,
      file,
      previous: previousMap.get(file.targetRelativePath),
    });
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
  const hookChecksums = new Map(input.plugins
    .filter((plugin) => plugin.hookConfigChecksum)
    .map((plugin) => [plugin.name, plugin.hookConfigChecksum!]));
  const hookMerge = buildHookMerge({
    consumerRoot: input.consumerRoot,
    selectedPlugins: input.selectedPlugins,
    pluginRoots,
    previousHooks: previous.managedHooks,
    settings: input.settings,
    rewriteMap: rewrite.hooks ? rewriteMap : new Map(),
    hookChecksums,
  });
  collisions.push(...hookMerge.collisions);

  const managedFiles: ManagedFile[] = selectedFiles.map((file) => ({
    plugin: file.plugin,
    sourceRelativePath: file.sourceRelativePath,
    targetRelativePath: file.targetRelativePath,
    sourceChecksum: file.sourceChecksum,
    installedChecksum: file.installedChecksum,
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
    targetDir,
    claudeSettingsPath,
    manifestPath: manifestPathFor(input.consumerRoot, 'claude'),
    installSettingsPath: input.installSettingsPath ?? (input.nextInstallSettings ? settingsPathFor(input.consumerRoot) : undefined),
    writes: writes.sort(byTarget),
    removals: removalPlan.removals,
    hookMutations: hookMerge.mutations,
    collisions,
    prompts,
    warnings,
    nextManifest,
    nextSettings: hookMerge.nextSettings,
    settingsChanged: hookMerge.settingsChanged,
    nextInstallSettings: input.nextInstallSettings,
    installSettingsChanged: input.nextInstallSettings !== undefined,
    migration: input.migration,
  };
}
