import * as path from 'node:path';
import { validateSafeSegment } from './install-settings-paths';
import { isTextTransformCandidate } from './prefix-transform';
import type { DiscoveredPluginFile } from './types';

interface RuntimeAssetFile extends DiscoveredPluginFile {
  targetRelativePath: string;
}

interface RuntimeAssetMap {
  pluginScripts: Map<string, string>;
  skillAssets: Map<string, string>;
}

const COMMAND_ARG_PREFIX = /((?:^|[\s(])(?:python3?|bash|sh|node|bun)\s+["']?)/.source;
const SOURCE_PLUGIN = /([a-z0-9][a-z0-9-]*)/.source;
const SOURCE_PATH = /(?:\.\/)?\.specify\/plugins/.source;
const SCRIPT_REL = /([^\s"'`$)]+)/.source;
const relativeSkillScriptRef = new RegExp(`${COMMAND_ARG_PREFIX}${SOURCE_PATH}/${SOURCE_PLUGIN}/skills/([^\\s/"'\`]+)/scripts/${SCRIPT_REL}`, 'gm');
const relativePluginScriptRef = new RegExp(`${COMMAND_ARG_PREFIX}${SOURCE_PATH}/${SOURCE_PLUGIN}/scripts/${SCRIPT_REL}`, 'gm');

function commandPath(targetRelativePath: string): string {
  return `$(pwd)/${targetRelativePath.split(path.sep).join('/')}`;
}

function normalizeAssetPath(value: string, label: string): string {
  if (
    value.trim() === '' ||
    path.posix.isAbsolute(value) ||
    value.includes('\\') ||
    value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

function sourceParts(file: RuntimeAssetFile): string[] {
  return file.sourceRelativePath.split('/');
}

function targetSkillName(file: RuntimeAssetFile): string | undefined {
  const parts = file.targetRelativePath.split(/[\\/]/);
  const skillIndex = parts.findIndex((part) => part === 'skills');
  return skillIndex === -1 ? undefined : parts[skillIndex + 1];
}

function runtimeAssetError(file: RuntimeAssetFile, detail: string): Error {
  return new Error(`Runtime asset transform failed for ${file.sourceRelativePath}: ${detail}`);
}

function hasRelativeExecutableSourceRef(text: string): boolean {
  relativePluginScriptRef.lastIndex = 0;
  relativeSkillScriptRef.lastIndex = 0;
  return relativePluginScriptRef.test(text) || relativeSkillScriptRef.test(text);
}

export function buildRuntimeAssetMap(files: RuntimeAssetFile[]): RuntimeAssetMap {
  const pluginScripts = new Map<string, string>();
  const skillAssets = new Map<string, string>();

  for (const file of files) {
    const parts = sourceParts(file);
    if (parts[0] === 'scripts' && parts.length > 1) {
      const rel = normalizeAssetPath(parts.slice(1).join('/'), 'plugin script path');
      pluginScripts.set(`${file.plugin}/${rel}`, commandPath(file.targetRelativePath));
      continue;
    }

    if (parts[0] === 'skills' && parts[1] && parts.length > 3 && (parts[2] === 'scripts' || parts[2] === 'references')) {
      const rel = normalizeAssetPath(parts.slice(2).join('/'), 'skill asset path');
      skillAssets.set(`${file.plugin}/${parts[1]}/${rel}`, commandPath(file.targetRelativePath));
      const targetSkill = targetSkillName(file);
      if (targetSkill && targetSkill !== parts[1]) {
        skillAssets.set(`${file.plugin}/${targetSkill}/${rel}`, commandPath(file.targetRelativePath));
      }
    }
  }

  return { pluginScripts, skillAssets };
}

function sourceSkillName(file: RuntimeAssetFile): string | undefined {
  const parts = sourceParts(file);
  return parts[0] === 'skills' ? parts[1] : undefined;
}

function assertNoUnresolvedRuntimeRefs(file: RuntimeAssetFile, text: string): void {
  if (/\$\{TDK_PLUGIN_SCRIPT_ROOT\}|\$\{TDK_SKILL_ROOT\}/.test(text)) {
    throw runtimeAssetError(file, 'unresolved runtime asset placeholder remains');
  }
  if (/\$\{CLAUDE_PLUGIN_ROOT\}|\$\{CLAUDE_SKILL_DIR\}/.test(text)) {
    throw runtimeAssetError(file, 'unresolved native runtime asset reference remains');
  }
  if (/\$\(pwd\)\/\.specify\/plugins\/[^\s"'`]+\/scripts\/[^\s"'`]+/.test(text)) {
    throw runtimeAssetError(file, 'unresolved executable plugin script source path remains');
  }
  if (/\$\(pwd\)\/\.specify\/plugins\/[^\s"'`]+\/skills\/[^\s"'`]+\/scripts\/[^\s"'`]+/.test(text)) {
    throw runtimeAssetError(file, 'unresolved executable skill script source path remains');
  }
  if (hasRelativeExecutableSourceRef(text)) {
    throw runtimeAssetError(file, 'unresolved executable relative script source path remains');
  }
}

function replacePluginScriptRef(file: RuntimeAssetFile, map: RuntimeAssetMap, plugin: string, rel: string): string {
  validateSafeSegment(plugin, 'runtime asset plugin id');
  const normalized = normalizeAssetPath(rel, 'plugin runtime asset path');
  const target = map.pluginScripts.get(`${plugin}/${normalized}`);
  if (!target) throw runtimeAssetError(file, `unknown plugin runtime asset: ${plugin}/${normalized}`);
  return target;
}

function replaceSkillAssetRef(file: RuntimeAssetFile, map: RuntimeAssetMap, skill: string | undefined, rel: string): string {
  if (!skill) throw runtimeAssetError(file, 'skill-local runtime assets can only be used from files inside a skill');
  const normalized = normalizeAssetPath(rel, 'skill runtime asset path');
  const target = map.skillAssets.get(`${file.plugin}/${skill}/${normalized}`);
  if (!target) throw runtimeAssetError(file, `unknown skill runtime asset: ${skill}/${normalized}`);
  return target;
}

export function transformRuntimeAssetContent(file: RuntimeAssetFile, content: Buffer, map: RuntimeAssetMap): Buffer {
  if (!isTextTransformCandidate(file.sourcePath)) return content;

  const skill = sourceSkillName(file);
  let text = content.toString('utf-8');

  text = text.replace(/\$\{CLAUDE_SKILL_DIR\}\/(scripts|references)\/([^\s"'`$)]+)/g, (_match, family: string, rel: string) => (
    replaceSkillAssetRef(file, map, skill, `${family}/${rel}`)
  ));
  text = text.replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/([^\s/"'`]+)\/(scripts|references)\/([^\s"'`$)]+)/g, (_match, sourceSkill: string, family: string, rel: string) => (
    replaceSkillAssetRef(file, map, sourceSkill, `${family}/${rel}`)
  ));
  text = text.replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/([^\s"'`$)]+)/g, (_match, rel: string) => (
    replacePluginScriptRef(file, map, file.plugin, rel)
  ));
  text = text.replace(/\$\{TDK_PLUGIN_SCRIPT_ROOT\}\/([a-z0-9][a-z0-9-]*)\/([^\s"'`$)]+)/g, (_match, plugin: string, rel: string) => (
    replacePluginScriptRef(file, map, plugin, rel)
  ));
  text = text.replace(/\$\{TDK_SKILL_ROOT\}\/([^\s"'`$)]+)/g, (_match, rel: string) => (
    replaceSkillAssetRef(file, map, skill, rel)
  ));
  text = text.replace(/\$\(pwd\)\/\.specify\/plugins\/([a-z0-9][a-z0-9-]*)\/skills\/([^\s/"'`]+)\/scripts\/([^\s"'`$)]+)/g, (_match, plugin: string, sourceSkill: string, rel: string) => (
    replaceSkillAssetRef({ ...file, plugin }, map, sourceSkill, `scripts/${rel}`)
  ));
  text = text.replace(/\$\(pwd\)\/\.specify\/plugins\/([a-z0-9][a-z0-9-]*)\/scripts\/([^\s"'`$)]+)/g, (_match, plugin: string, rel: string) => (
    replacePluginScriptRef(file, map, plugin, rel)
  ));
  text = text.replace(relativeSkillScriptRef, (_match, prefix: string, plugin: string, sourceSkill: string, rel: string) => (
    `${prefix}${replaceSkillAssetRef({ ...file, plugin }, map, sourceSkill, `scripts/${rel}`)}`
  ));
  text = text.replace(relativePluginScriptRef, (_match, prefix: string, plugin: string, rel: string) => (
    `${prefix}${replacePluginScriptRef(file, map, plugin, rel)}`
  ));

  assertNoUnresolvedRuntimeRefs(file, text);
  return Buffer.from(text, 'utf-8');
}
