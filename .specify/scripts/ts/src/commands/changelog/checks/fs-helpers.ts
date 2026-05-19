// Shared filesystem helpers for verify checks.
// Paths follow actual tdk layout:
//   <root>/.claude-plugin/marketplace.json
//   <root>/.specify/CHANGELOG.md
//   <root>/.specify/plugins/manifest.json
//   <root>/.specify/plugins/<plugin>/.claude-plugin/plugin.json
//   <root>/.specify/plugins/<plugin>/skills/<skill>/SKILL.md
// [RT4-7] execFileSync + array args only; never string interpolation into shell.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Manifest } from './types';

export const MARKETPLACE_JSON = (root: string) =>
  join(root, '.claude-plugin', 'marketplace.json');

export const CHANGELOG_MD = (root: string) =>
  join(root, '.specify', 'CHANGELOG.md');

export const MANIFEST_JSON = (root: string) =>
  join(root, '.specify', 'plugins', 'manifest.json');

export const PLUGIN_DIR = (root: string, plugin: string) =>
  join(root, '.specify', 'plugins', plugin);

export const SKILL_MD = (root: string, plugin: string, skill: string) =>
  join(PLUGIN_DIR(root, plugin), 'skills', skill, 'SKILL.md');

/** Resolve plugin.json under .claude-plugin/. Returns null if absent. */
export function resolvePluginJson(root: string, plugin: string): string | null {
  const nested = join(PLUGIN_DIR(root, plugin), '.claude-plugin', 'plugin.json');
  return existsSync(nested) ? nested : null;
}

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

export function readManifest(root: string): Manifest {
  return readJson<Manifest>(MANIFEST_JSON(root));
}

/** Parse SKILL.md frontmatter → metadata.version. Returns null if no frontmatter / version. */
export function readSkillVersion(skillMdPath: string): string | null {
  const raw = readFileSync(skillMdPath, 'utf-8');
  // Frontmatter pattern: leading '---\n...\n---' block
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return null;
  const yamlBlock = raw.slice(3, end).replace(/^\n/, '');
  const parsed = parseYaml(yamlBlock) as { metadata?: { version?: string }; version?: string } | null;
  if (!parsed) return null;
  return parsed.metadata?.version ?? parsed.version ?? null;
}

/** Find which plugin directory contains a given skill (by folder presence). */
export function findSkillPlugin(root: string, skill: string): string | null {
  const base = join(root, '.specify', 'plugins');
  if (!existsSync(base)) return null;
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  for (const entry of readdirSync(base)) {
    const skillDir = join(base, entry, 'skills', skill);
    if (existsSync(skillDir) && statSync(skillDir).isDirectory()) return entry;
  }
  return null;
}
