import type { ManifestEntry } from './manifest-types';

export type HarnessName = 'claude' | 'codex';

export type InstallAction = 'create' | 'update';

export type HookHandler = Record<string, unknown> & { type: string };

export type CollisionKind =
  | 'unmanaged-target-exists'
  | 'managed-drift'
  | 'directory-file-conflict'
  | 'unsafe-symlink'
  | 'path-traversal'
  | 'unmanaged-duplicate-hook'
  | 'unmanaged-stale-hooks-json'
  | 'invalid-manifest'
  | 'invalid-hook-config'
  | 'unknown-hook-command'
  | 'io-error';

export interface HarnessInstallManifest {
  version: 1;
  harness: HarnessName;
  selectedPlugins: string[];
  installerVersion: string;
  installedAt: string;
  managedFiles: ManagedFile[];
  managedHooks: ManagedHook[];
}

export interface ManagedFile {
  plugin: string;
  sourceRelativePath: string;
  targetRelativePath: string;
  sourceChecksum: string;
  installedChecksum: string;
}

export interface ManagedHook {
  id: string;
  plugin: string;
  event: string;
  matcher: string;
  type: string;
  handler?: HookHandler;
  command?: string;
  sourceRelativePath?: string;
  sourceChecksum?: string;
  handlerChecksum?: string;
  ownershipKey?: string;
}

export interface DiscoveredPluginFile {
  plugin: string;
  sourceRelativePath: string;
  sourcePath: string;
  sourceChecksum: string;
  targetRelativePath: string;
}

export interface TransformedPluginFile extends DiscoveredPluginFile {
  installedChecksum: string;
  content: Buffer;
}

export interface DiscoveredPlugin {
  name: string;
  version: string;
  components?: ManifestEntry['components'];
  hookConfigChecksum?: string;
  root: string;
  files: DiscoveredPluginFile[];
}

export interface PluginInventory {
  consumerRoot: string;
  pluginsDir: string;
  manifestPath: string;
  plugins: DiscoveredPlugin[];
  warnings: string[];
}

export interface PlannedWrite {
  plugin: string;
  sourcePath: string;
  sourceRelativePath: string;
  targetPath: string;
  targetRelativePath: string;
  sourceChecksum: string;
  installedChecksum: string;
  content: Buffer;
  expectedTargetChecksum?: string;
  action: InstallAction;
}

export interface PlannedRemoval {
  targetPath: string;
  targetRelativePath: string;
  previous: ManagedFile;
}

export interface Collision {
  kind: CollisionKind;
  path?: string;
  message: string;
  plugin?: string;
}

export interface RequiredPrompt {
  type: 'managed-drift-overwrite' | 'unmanaged-target-overwrite' | 'unmanaged-stale-hooks-json-cleanup';
  path: string;
  targetRelativePath: string;
  expectedTargetChecksum?: string;
}

export interface PlannedHookMutation {
  action: 'add' | 'remove';
  hook: ManagedHook;
}

export interface InstallPlan {
  harness: HarnessName;
  consumerRoot: string;
  selectedPlugins: string[];
  targetDir: string;
  claudeSettingsPath: string;
  manifestPath: string;
  installSettingsPath?: string;
  writes: PlannedWrite[];
  removals: PlannedRemoval[];
  hookMutations: PlannedHookMutation[];
  collisions: Collision[];
  prompts: RequiredPrompt[];
  warnings: string[];
  nextManifest: HarnessInstallManifest;
  nextSettings?: unknown;
  settingsChanged: boolean;
  nextInstallSettings?: unknown;
  installSettingsChanged: boolean;
  migration?: PrefixMigrationPlan;
  operationStamp?: string;
}

export interface BuildPlanInput {
  consumerRoot: string;
  selectedPlugins: string[];
  plugins: DiscoveredPlugin[];
  rewritePlugins?: DiscoveredPlugin[];
  previousManifest: HarnessInstallManifest;
  settings: unknown;
  sourcePrefix?: string;
  targetPrefix?: string;
  rewrite?: {
    paths: boolean;
    textFiles: boolean;
    hooks: boolean;
  };
  targetDir?: string;
  settingsPath?: string;
  installSettingsPath?: string;
  nextInstallSettings?: unknown;
  migration?: PrefixMigrationPlan;
}

export interface ApplyOptions {
  yes: boolean;
  interactive: boolean;
  approveOverwrite?: (prompt: RequiredPrompt) => Promise<boolean>;
}

export interface ApplyResult {
  written: string[];
  removed: string[];
  backedUp: string[];
  manifestPath: string;
  settingsWritten: boolean;
  installSettingsWritten: boolean;
  migrationJournalPath?: string;
  warnings: string[];
}

export interface PrefixMigrationPlan {
  fromPrefix: string;
  toPrefix: string;
}
