// Read a component's version from its source-of-truth definition file.
// plugin-bump writes versions into these locations on bump:
//   - skills:   plugin/skills/<name>/SKILL.md       → frontmatter `metadata.version`
//   - agents:   plugin/agents/<name>.md             → frontmatter `metadata.version` or top-level `version`
//   - commands: plugin/commands/<name>.md OR
//               plugin/commands/<name>/<name>.md    → frontmatter top-level `version`
//   - hooks:    plugin/hooks/hooks.json             → top-level `version`
//
// manifest compute now reads from these sources first, falling back to the existing
// manifest.json entry (for plugins that haven't migrated yet), then to '0.1.0'.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ComponentType } from './types';

/** Return version string or null if no version present in source. */
export function readComponentVersionFromSource(
  pluginDir: string,
  type: ComponentType,
  name: string,
): string | null {
  switch (type) {
    case 'skills':   return readSkillVersion(path.join(pluginDir, 'skills', name, 'SKILL.md'));
    case 'agents':   return readAgentVersion(path.join(pluginDir, 'agents', `${name}.md`));
    case 'commands': return readCommandVersion(pluginDir, name);
    case 'hooks':    return readHookVersion(path.join(pluginDir, 'hooks', 'hooks.json'));
  }
}

function readFrontmatterText(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return null;
  return raw.slice(3, end).replace(/^\n/, '');
}

/** Skills use block-style metadata.version (per plugin-bump convention). Falls back to top-level. */
function readSkillVersion(skillMdPath: string): string | null {
  const fm = readFrontmatterText(skillMdPath);
  if (fm === null) return null;
  try {
    const parsed = parseYaml(fm) as { metadata?: { version?: string }; version?: string } | null;
    if (!parsed) return null;
    return parsed.metadata?.version ?? parsed.version ?? null;
  } catch {
    return null;
  }
}

/** Agents support metadata.version or top-level version; dual fields must agree. */
function readAgentVersion(agentMdPath: string): string | null {
  const fm = readFrontmatterText(agentMdPath);
  if (fm === null) return null;
  try {
    const parsed = parseYaml(fm) as { version?: string; metadata?: { version?: string } } | null;
    if (!parsed) return null;
    const metadataVersion = parsed.metadata?.version;
    if (parsed.version && metadataVersion && parsed.version !== metadataVersion) {
      throw new Error(
        `Conflicting agent versions in ${agentMdPath}: top-level version ${parsed.version} differs from metadata.version ${metadataVersion}`,
      );
    }
    return metadataVersion ?? parsed.version ?? null;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Conflicting agent versions')) throw error;
    return null;
  }
}

/** Commands use top-level version, falling back to metadata.version for legacy files. */
function readMarkdownTopVersion(mdPath: string): string | null {
  const fm = readFrontmatterText(mdPath);
  if (fm === null) return null;
  try {
    const parsed = parseYaml(fm) as { version?: string; metadata?: { version?: string } } | null;
    if (!parsed) return null;
    return parsed.version ?? parsed.metadata?.version ?? null;
  } catch {
    return null;
  }
}

/** Commands can be a single .md file or a folder. Try both. */
function readCommandVersion(pluginDir: string, name: string): string | null {
  const flat = path.join(pluginDir, 'commands', `${name}.md`);
  if (fs.existsSync(flat)) return readMarkdownTopVersion(flat);
  const nested = path.join(pluginDir, 'commands', name, `${name}.md`);
  if (fs.existsSync(nested)) return readMarkdownTopVersion(nested);
  return null;
}

/** Hooks store version at the top-level of hooks.json. */
function readHookVersion(hooksJsonPath: string): string | null {
  if (!fs.existsSync(hooksJsonPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf-8')) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}
