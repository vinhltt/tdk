export type HarnessName = 'claude';

export type InstallAction = 'create' | 'update';

export type CollisionKind =
  | 'unmanaged-target-exists'
  | 'managed-drift'
  | 'directory-file-conflict'
  | 'unsafe-symlink'
  | 'path-traversal'
  | 'unmanaged-duplicate-hook'
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
  type: 'command';
  command: string;
}

export interface DiscoveredPluginFile {
  plugin: string;
  sourceRelativePath: string;
  sourcePath: string;
  sourceChecksum: string;
  targetRelativePath: string;
}

export interface DiscoveredPlugin {
  name: string;
  version: string;
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
  type: 'managed-drift-overwrite' | 'unmanaged-target-overwrite';
  path: string;
  targetRelativePath: string;
}

export interface PlannedHookMutation {
  action: 'add' | 'remove';
  hook: ManagedHook;
}

export interface InstallPlan {
  harness: HarnessName;
  consumerRoot: string;
  selectedPlugins: string[];
  writes: PlannedWrite[];
  removals: PlannedRemoval[];
  hookMutations: PlannedHookMutation[];
  collisions: Collision[];
  prompts: RequiredPrompt[];
  warnings: string[];
  nextManifest: HarnessInstallManifest;
  nextSettings?: unknown;
}

export interface BuildPlanInput {
  consumerRoot: string;
  selectedPlugins: string[];
  plugins: DiscoveredPlugin[];
  previousManifest: HarnessInstallManifest;
  settings: unknown;
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
}
