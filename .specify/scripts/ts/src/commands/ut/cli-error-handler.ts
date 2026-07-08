// Shared CLI error handler for all ut-* commands
// Unified JSON error output for SW + module errors (RT#9, V2-2)

import type { ConfigResult } from '../../utils/index';

export function handleCliError(
  config: ConfigResult,
  opts: { subWorkspace?: string; module?: string }
): { error: string; message: string; availableSubWorkspaces?: string[]; availableModules?: string[] } | null {
  // Surface parseConfig failures from YAML, invalid JSON, and schema errors.
  if (config.error?.startsWith('parse_error:')) {
    return { error: 'parse_error', message: config.error };
  }
  // SW not found — migrated from stderr to JSON (V2-2)
  if (config.error === 'sub_workspace_not_found') {
    return {
      error: 'sub_workspace_not_found',
      message: `Sub-workspace '${config.requestedSubWorkspace}' not found.`,
      availableSubWorkspaces: config.availableSubWorkspaces ?? [],
    };
  }
  // Module not found — SW found but module doesn't match
  if (config.error === 'module_not_found') {
    return {
      error: 'module_not_found',
      message: `Module not found in sub-workspace "${config.targetSubWorkspace?.name ?? '(unknown)'}".`,
      availableModules: config.availableModules ?? [],
    };
  }
  // --module without --sub-workspace → require explicit flag
  if (opts.module && !config.targetSubWorkspace) {
    return {
      error: 'sub_workspace_required',
      message: `--module requires --sub-workspace. Pass both flags explicitly.`,
      availableSubWorkspaces: (config.subWorkspaces ?? []).map(s => s.name),
    };
  }
  return null;
}
