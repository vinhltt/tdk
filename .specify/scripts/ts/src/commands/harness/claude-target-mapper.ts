import * as path from 'node:path';
import type { HarnessName } from './types';

export interface HarnessTargetMapper {
  name: HarnessName;
  targetDir(): '.claude';
  settingsPath(): '.claude/settings.json';
  hookRoot(plugin: string): string;
  scriptRoot(plugin: string): string;
  mapTargetPath(plugin: string, sourceRelativePath: string): string | undefined;
}

export const claudeTargetMapper: HarnessTargetMapper = {
  name: 'claude',
  targetDir: () => '.claude',
  settingsPath: () => '.claude/settings.json',
  hookRoot: (plugin) => path.join('.claude', 'hooks', plugin),
  scriptRoot: (plugin) => path.join('.claude', 'scripts', plugin),
  mapTargetPath(plugin, sourceRelativePath) {
    const parts = sourceRelativePath.split('/');
    const family = parts[0];
    const rest = parts.slice(1).join('/');
    if (!rest) return undefined;
    switch (family) {
      case 'skills':
        return path.join('.claude', 'skills', rest);
      case 'agents':
        return path.join('.claude', 'agents', rest);
      case 'hooks':
        if (rest === 'hooks.json') return undefined;
        return path.join('.claude', 'hooks', plugin, rest);
      case 'commands':
        return path.join('.claude', 'commands', rest);
      case 'lib':
        return path.join('.claude', 'lib', rest);
      case 'scripts':
        return path.join('.claude', 'scripts', plugin, rest);
      default:
        return undefined;
    }
  },
};

export function resolveHarnessTargetMapper(name: HarnessName): HarnessTargetMapper {
  if (name !== 'claude') throw new Error(`Harness "${name}" is not implemented yet.`);
  return claudeTargetMapper;
}
