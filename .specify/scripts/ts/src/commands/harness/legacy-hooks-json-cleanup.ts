import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256File } from './checksum';
import type { BuildPlanInput, Collision, ManagedFile, RequiredPrompt } from './types';

export function planLegacyHooksJsonInspection(
  input: BuildPlanInput,
  previousMap: Map<string, ManagedFile>,
): { collisions: Collision[]; prompts: RequiredPrompt[]; warnings: string[] } {
  const targetRelativePath = path.join('.claude', 'hooks', 'hooks.json');
  if (previousMap.has(targetRelativePath)) return { collisions: [], prompts: [], warnings: [] };

  const target = path.join(input.consumerRoot, targetRelativePath);
  if (!fs.existsSync(target)) return { collisions: [], prompts: [], warnings: [] };

  const stat = fs.lstatSync(target);
  if (!stat.isFile()) {
    return {
      collisions: [],
      prompts: [],
      warnings: [`Existing ${targetRelativePath} is not a file; leaving it unchanged.`],
    };
  }

  const sourceHookChecksums = new Set<string>();
  for (const plugin of input.plugins) {
    const sourceHooks = path.join(plugin.root, 'hooks', 'hooks.json');
    if (fs.existsSync(sourceHooks) && fs.lstatSync(sourceHooks).isFile()) {
      sourceHookChecksums.add(sha256File(sourceHooks));
    }
  }

  const targetChecksum = sha256File(target);
  if (sourceHookChecksums.has(targetChecksum)) {
    return {
      collisions: [{
        kind: 'unmanaged-stale-hooks-json',
        path: target,
        message: `Unmanaged stale generated hook config exists: ${targetRelativePath}`,
      }],
      prompts: [{ type: 'unmanaged-stale-hooks-json-cleanup', path: target, targetRelativePath, expectedTargetChecksum: targetChecksum }],
      warnings: [],
    };
  }

  return {
    collisions: [],
    prompts: [],
    warnings: [`Unmanaged ${targetRelativePath} exists; Claude Code does not read this file as project hook runtime. Leaving it unchanged.`],
  };
}
