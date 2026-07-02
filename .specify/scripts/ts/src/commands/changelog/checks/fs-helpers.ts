// Shared filesystem helpers for verify checks.
// Paths follow actual tdk layout:
//   <root>/.claude-plugin/marketplace.json
//   <root>/.specify/CHANGELOG.md
//   <root>/.specify/plugins/manifest.json
//   <root>/.specify/plugins/<plugin>/.claude-plugin/plugin.json     (anchor — required)
//   <root>/.specify/codex-plugins/<plugin>/.codex-plugin/plugin.json (Codex — optional, sibling dir)
//   <root>/.specify/plugins/<plugin>/.cursor-plugin/plugin.json     (Cursor — optional)
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

/**
 * Manifest formats discovered by tdk-bump / plugin-bump.
 * Claude is the anchor — required and authoritative. Codex/Cursor are
 * optional per-platform mirrors. plugin-bump auto-scaffolds missing
 * Codex/Cursor manifests by copying the Claude anchor.
 */
export type ManifestFormat = 'claude' | 'codex' | 'cursor';

export interface ManifestTarget {
  format: ManifestFormat;
  dir: string;
  /** Optional: override the plugin base dir resolver (defaults to PLUGIN_DIR). */
  pluginDir?: (root: string, plugin: string) => string;
}

/** Codex package root: sibling to the source plugin dir post-migration. */
const CODEX_PLUGIN_DIR = (root: string, plugin: string) =>
  join(root, '.specify', 'codex-plugins', plugin);

export const MANIFEST_FORMATS: readonly ManifestTarget[] = [
  { format: 'claude', dir: '.claude-plugin' },
  { format: 'codex',  dir: '.codex-plugin', pluginDir: CODEX_PLUGIN_DIR },
  { format: 'cursor', dir: '.cursor-plugin' },
] as const;

/** Resolve Claude-anchor plugin.json. Returns null if absent. Used for existence/identity checks. */
export function resolvePluginJson(root: string, plugin: string): string | null {
  const nested = join(PLUGIN_DIR(root, plugin), '.claude-plugin', 'plugin.json');
  return existsSync(nested) ? nested : null;
}

/**
 * Resolve every existing plugin.json across all manifest formats for a plugin.
 * Returns empty array if none exist. Order matches MANIFEST_FORMATS (claude first).
 *
 * Codex plugin.json lives at .specify/codex-plugins/<plugin>/.codex-plugin/plugin.json
 * (sibling layout, post-migration) rather than under the source plugin dir.
 */
export function resolveAllPluginJson(root: string, plugin: string): Array<{ format: ManifestFormat; path: string }> {
  const out: Array<{ format: ManifestFormat; path: string }> = [];
  for (const target of MANIFEST_FORMATS) {
    const baseDir = target.pluginDir ? target.pluginDir(root, plugin) : PLUGIN_DIR(root, plugin);
    const pluginJsonPath = join(baseDir, target.dir, 'plugin.json');
    if (existsSync(pluginJsonPath)) out.push({ format: target.format, path: pluginJsonPath });
  }
  return out;
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
    if (existsSync(skillDir) && statSync(skillDir).isDirectory() && existsSync(join(skillDir, 'SKILL.md'))) return entry;
  }
  return null;
}
