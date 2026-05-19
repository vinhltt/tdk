// Seed component versions from plugin.json _checksums for one-time manifest migration.
// Mirrors Python seed_versions_from_checksums(). Handles 3 plugin.json format variants.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { COMPONENT_TYPES } from './types';
import type { ComponentType } from './types';

/** Result: { plugin_name: { component_type: { name: version_str } } } */
export type SeededVersions = Record<string, Partial<Record<ComponentType, Record<string, string>>>>;

/** Read a plugin.json from .claude-plugin/plugin.json or plugin.json fallback. Returns null if neither found. */
function readPluginJson(pluginDir: string): Record<string, unknown> | null {
  let pjPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(pjPath)) {
    pjPath = path.join(pluginDir, 'plugin.json');
  }
  if (!fs.existsSync(pjPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pjPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Read component versions from each plugin.json for --seed migration.
 * Handles 3 formats (mirrors Python exactly):
 *   1. _checksums: {skills: {name: {version, checksum}}, ...}  (new format)
 *   2. _skillChecksums: {name: {version, checksum}}            (legacy)
 *   3. skills: {name: {version, checksum}}                     (most plugins)
 */
export function seedVersionsFromChecksums(pluginsDir: string): SeededVersions {
  const seeded: SeededVersions = {};

  const entries = fs.readdirSync(pluginsDir).sort();
  for (const name of entries) {
    const pluginDir = path.join(pluginsDir, name);
    if (!fs.statSync(pluginDir).isDirectory()) continue;
    if (name.startsWith('.')) continue;

    const data = readPluginJson(pluginDir);
    if (!data) continue;

    const pluginVersions: Partial<Record<ComponentType, Record<string, string>>> = {};

    // Format 1: _checksums with nested component types
    const checksums = data['_checksums'];
    if (checksums && typeof checksums === 'object' && !Array.isArray(checksums)) {
      const ck = checksums as Record<string, unknown>;
      for (const compType of COMPONENT_TYPES) {
        const entries = ck[compType];
        if (entries && typeof entries === 'object' && !Array.isArray(entries)) {
          const entriesMap = entries as Record<string, unknown>;
          for (const [compName, info] of Object.entries(entriesMap)) {
            if (info && typeof info === 'object' && !Array.isArray(info)) {
              const infoMap = info as Record<string, unknown>;
              if ('version' in infoMap) {
                if (!pluginVersions[compType]) pluginVersions[compType] = {};
                pluginVersions[compType]![compName] = infoMap['version'] as string;
              }
            }
          }
        }
      }
    }

    // Format 2: _skillChecksums (legacy) — only if Format 1 found nothing
    if (Object.keys(pluginVersions).length === 0) {
      const legacy = data['_skillChecksums'];
      if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
        const legacyMap = legacy as Record<string, unknown>;
        for (const [compName, info] of Object.entries(legacyMap)) {
          if (info && typeof info === 'object' && !Array.isArray(info)) {
            const infoMap = info as Record<string, unknown>;
            if ('version' in infoMap) {
              if (!pluginVersions['skills']) pluginVersions['skills'] = {};
              pluginVersions['skills']![compName] = infoMap['version'] as string;
            }
          }
        }
      }
    }

    // Format 3: skills field as dict — only if Formats 1+2 found nothing
    if (Object.keys(pluginVersions).length === 0) {
      const skillsField = data['skills'];
      if (skillsField && typeof skillsField === 'object' && !Array.isArray(skillsField)) {
        const skillsMap = skillsField as Record<string, unknown>;
        for (const [compName, info] of Object.entries(skillsMap)) {
          if (info && typeof info === 'object' && !Array.isArray(info)) {
            const infoMap = info as Record<string, unknown>;
            if ('version' in infoMap) {
              if (!pluginVersions['skills']) pluginVersions['skills'] = {};
              pluginVersions['skills']![compName] = infoMap['version'] as string;
            }
          }
        }
      }
    }

    if (Object.keys(pluginVersions).length > 0) {
      seeded[name] = pluginVersions;
    }
  }

  return seeded;
}
