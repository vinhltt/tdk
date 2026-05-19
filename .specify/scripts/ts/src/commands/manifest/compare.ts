// File-level and component-level comparison. Mirrors Python compare_plugin + compare_components.

import { COMPONENT_TYPES } from './types';
import type { ComponentType, FileComparison, PluginComponents, PluginComparison } from './types';

/**
 * Classify files as new/changed/removed/unchanged.
 * Port of Python compare_plugin(current_files, manifest_files).
 */
export function comparePlugin(
  currentFiles: Record<string, string>,
  manifestFiles: Record<string, string>,
): Pick<PluginComparison, 'new_files' | 'changed_files' | 'removed_files' | 'unchanged_files'> {
  const currentSet = new Set(Object.keys(currentFiles));
  const manifestSet = new Set(Object.keys(manifestFiles));

  const newFiles = [...currentSet].filter((p) => !manifestSet.has(p)).sort();
  const removedFiles = [...manifestSet].filter((p) => !currentSet.has(p)).sort();
  const changedFiles = [...currentSet]
    .filter((p) => manifestSet.has(p) && currentFiles[p] !== manifestFiles[p])
    .sort();
  const unchangedFiles = [...currentSet]
    .filter((p) => manifestSet.has(p) && currentFiles[p] === manifestFiles[p])
    .sort();

  return {
    new_files: newFiles,
    changed_files: changedFiles,
    removed_files: removedFiles,
    unchanged_files: unchangedFiles,
  };
}

/**
 * Return true if the given relative path falls under the component's prefix.
 * Trailing slash on dir prefixes prevents "skills/foo" matching "skills/foo-bar/…".
 *
 * Hooks: always 1 component per plugin, keyed by plugin name.
 * Any file under hooks/ means the hook component changed.
 */
function matchesPrefix(type: ComponentType, name: string, pluginName: string, filePath: string): boolean {
  switch (type) {
    case 'skills':   return filePath.startsWith(`skills/${name}/`);
    case 'agents':   return filePath === `agents/${name}.md`;
    case 'hooks':    return name === pluginName && filePath.startsWith('hooks/');
    case 'commands': return filePath.startsWith(`commands/${name}/`) || filePath === `commands/${name}.md`;
  }
}

/**
 * Classify components as new/changed/unchanged/removed per type.
 *
 * Fix for Python bug (line 251): changed_components[type] was always [].
 * Now cross-references file diff to determine which components actually changed.
 *
 * @param current   Components identified from current disk state
 * @param manifest  Components recorded in the last manifest snapshot
 * @param fc        File-level diff (paths relative to plugin root)
 * @param pluginName Plugin directory name — needed to key the hooks bucket
 */
export function compareComponents(
  current: PluginComponents,
  manifest: Record<string, { version?: string }> | PluginComponents,
  fc: FileComparison,
  pluginName: string,
): Pick<PluginComparison, 'new_components' | 'changed_components' | 'unchanged_components' | 'removed_components'> {
  // Union of all paths that represent any change (add / modify / delete)
  const allChanged = [...fc.newFiles, ...fc.changedFiles, ...fc.removedFiles];

  const newComponents = {} as Record<ComponentType, string[]>;
  const changedComponents = {} as Record<ComponentType, string[]>;
  const unchangedComponents = {} as Record<ComponentType, string[]>;
  const removedComponents = {} as Record<ComponentType, string[]>;

  for (const compType of COMPONENT_TYPES) {
    const curNames = new Set(Object.keys(current[compType] ?? {}));
    const manEntry = (manifest as Record<string, Record<string, unknown>>)[compType] ?? {};
    const manNames = new Set(Object.keys(manEntry));

    const newC = [...curNames].filter((n) => !manNames.has(n)).sort();
    const removed = [...manNames].filter((n) => !curNames.has(n)).sort();
    const existing = [...curNames].filter((n) => manNames.has(n));

    const changed = existing
      .filter((n) => allChanged.some((p) => matchesPrefix(compType, n, pluginName, p)))
      .sort();
    const changedSet = new Set(changed);
    const unchanged = existing.filter((n) => !changedSet.has(n)).sort();

    newComponents[compType] = newC;
    changedComponents[compType] = changed;
    unchangedComponents[compType] = unchanged;
    removedComponents[compType] = removed;
  }

  return {
    new_components: newComponents,
    changed_components: changedComponents,
    unchanged_components: unchangedComponents,
    removed_components: removedComponents,
  };
}
