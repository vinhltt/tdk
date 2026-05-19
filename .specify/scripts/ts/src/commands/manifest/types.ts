// Re-export Manifest types from changelog checks — single source of truth.
// Additional intermediate types for compute-manifest pipeline.

export type { Manifest, ManifestEntry } from '../changelog/checks/types';

export type ComponentType = 'skills' | 'agents' | 'hooks' | 'commands';

export const COMPONENT_TYPES: readonly ComponentType[] = ['skills', 'agents', 'hooks', 'commands'];

// Directories and extensions excluded from hashing (mirrors Python EXCLUDE_DIRS / EXCLUDE_EXTENSIONS)
export const EXCLUDE_DIRS = new Set(['.git', '__pycache__', '.logs']);
export const EXCLUDE_EXTENSIONS = new Set(['.pyc']);

/** Per-component map: component name → {version} */
export type ComponentMap = Record<string, { version?: string }>;

/** Current state of a plugin's components (before version resolution) */
export type PluginComponents = {
  skills: ComponentMap;
  agents: ComponentMap;
  hooks: ComponentMap;
  commands: ComponentMap;
};

/** File-level diff for a plugin (paths relative to plugin root) */
export interface FileComparison {
  newFiles: string[];
  changedFiles: string[];
  removedFiles: string[];
  unchangedFiles: string[];
}

/** Comparison result for a single plugin (snake_case keys to match Python JSON output) */
export interface PluginComparison {
  new_files: string[];
  changed_files: string[];
  removed_files: string[];
  unchanged_files: string[];
  new_components: Record<ComponentType, string[]>;
  changed_components: Record<ComponentType, string[]>;
  unchanged_components: Record<ComponentType, string[]>;
  removed_components: Record<ComponentType, string[]>;
}
