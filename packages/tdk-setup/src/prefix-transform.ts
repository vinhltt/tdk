import * as path from 'node:path';
import { claudeTargetMapper } from './claude-target-mapper';
import { normalizeTargetRelativePath, posixTargetPath } from './target-relative-path';
import type { DiscoveredPlugin, HookHandler } from './types';

export interface PrefixTransformSettings {
  sourcePrefix: string;
  targetPrefix: string;
}

const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.js',
  '.json',
  '.md',
  '.py',
  '.sh',
  '.tpl',
  '.ts',
  '.yaml',
  '.yml',
]);

const EXCLUDED_NAMES = new Set([
  'bun.lockb',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);
const SOURCE_PLUGIN_PATH = /(?:\.\/)?\.specify\/plugins\/[^\s"'`)\]}]+/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteName(name: string, settings: PrefixTransformSettings): string {
  return name.startsWith(settings.sourcePrefix)
    ? `${settings.targetPrefix}${name.slice(settings.sourcePrefix.length)}`
    : name;
}

function collectComponentNames(plugin: DiscoveredPlugin): string[] {
  const names = new Set<string>([plugin.name]);
  for (const family of ['skills', 'agents', 'commands'] as const) {
    for (const name of Object.keys(plugin.components?.[family] ?? {})) names.add(name);
  }
  for (const file of plugin.files) {
    const parts = file.sourceRelativePath.split('/');
    const family = parts[0];
    if ((family === 'skills' || family === 'agents' || family === 'commands') && parts[1]) {
      names.add(parts[1]);
    }
  }
  return [...names].sort();
}

export function buildPrefixRewriteMap(plugins: DiscoveredPlugin[], settings: PrefixTransformSettings): Map<string, string> {
  const rewriteMap = new Map<string, string>();
  for (const plugin of plugins) {
    for (const name of collectComponentNames(plugin)) {
      const rewritten = rewriteName(name, settings);
      if (rewritten !== name) rewriteMap.set(name, rewritten);
    }
  }
  return rewriteMap;
}

export function transformTargetRelativePath(targetRelativePath: string, settings: PrefixTransformSettings): string {
  const normalized = normalizeTargetRelativePath(targetRelativePath).split('/');
  const familyIndex = normalized.findIndex((part) => part === 'skills' || part === 'agents' || part === 'commands');
  if (familyIndex !== -1 && normalized[familyIndex + 1]) {
    normalized[familyIndex + 1] = rewriteName(normalized[familyIndex + 1]!, settings);
  }
  if ((normalized[0] === '.claude' || normalized[0] === '.codex') && (normalized[1] === 'scripts' || normalized[1] === 'hooks') && normalized[2]) {
    normalized[2] = rewriteName(normalized[2], settings);
  }
  return posixTargetPath(...normalized);
}

export function isTextTransformCandidate(filePath: string): boolean {
  const name = path.basename(filePath);
  if (EXCLUDED_NAMES.has(name)) return false;
  return TEXT_EXTENSIONS.has(path.extname(filePath));
}

// Rewrite sourcePrefix at clean left boundaries; hyphen-infix tokens stay untouched.
function blanketRewrite(text: string, settings: PrefixTransformSettings): string {
  return text.replace(
    new RegExp(`(?<![a-z0-9-])${escapeRegExp(settings.sourcePrefix)}`, 'g'),
    settings.targetPrefix,
  );
}

function brandRewrite(text: string, settings: PrefixTransformSettings): string {
  const source = settings.sourcePrefix.replace(/-$/, '');
  const target = settings.targetPrefix.replace(/-$/, '');
  if (!source || !target) return text;
  let result = text;
  for (const [from, to] of [
    [source.toLowerCase(), target.toLowerCase()],
    [source.toUpperCase(), target.toUpperCase()],
  ] as const) {
    result = result.replace(new RegExp(`(?<![\\w\${-])${escapeRegExp(from)}(?![\\w-])`, 'g'), to);
  }
  return result;
}

// Validate a single path segment — reject traversal-like, empty, absolute, or backslash-bearing.
function isValidSegment(segment: string): boolean {
  if (!segment || segment === '.' || segment === '..') return false;
  if (segment.includes('\\')) return false;
  if (path.posix.isAbsolute(segment)) return false;
  return true;
}

// Convert a matched .specify/plugins/... source segment using claudeTargetMapper.
// Returns the converted (and blanket-rewritten) string, or the original segment verbatim.
function convertSourceSegment(segment: string, settings: PrefixTransformSettings): string {
  // Strip optional leading ./
  const normalized = segment.startsWith('./') ? segment.slice(2) : segment;

  // Peel trailing prose punctuation (.,;:!?) before parsing
  const punctuationMatch = normalized.match(/([.,;:!?]+)$/);
  const suffix = punctuationMatch ? punctuationMatch[1]! : '';
  const core = suffix ? normalized.slice(0, -suffix.length) : normalized;
  const trailingSlash = core.endsWith('/');
  const parseCore = trailingSlash ? core.slice(0, -1) : core;

  // Parse: .specify/plugins/<plugin>/<family>/<rest>
  // core = ".specify/plugins/<plugin>/..."
  const afterPluginsPrefix = parseCore.slice('.specify/plugins/'.length);
  const slashIndex = afterPluginsPrefix.indexOf('/');
  if (slashIndex === -1) {
    // Bare plugin dir — mapper would get empty rest → undefined; stay verbatim
    return segment;
  }

  const plugin = afterPluginsPrefix.slice(0, slashIndex);
  const familyAndRest = afterPluginsPrefix.slice(slashIndex + 1);

  // Validate plugin segment
  if (!isValidSegment(plugin)) return segment;

  // Validate all segments of familyAndRest
  const restParts = familyAndRest.split('/');
  if (!restParts.every(isValidSegment)) return segment;

  if (restParts.length === 1) {
    const familyRoot = claudeFamilyRoot(plugin, restParts[0]!, settings);
    if (familyRoot !== undefined) return familyRoot + (trailingSlash ? '/' : '') + suffix;
  }

  // Call mapper with the full family/rest string
  const mapped = claudeTargetMapper.mapTargetPath(plugin, familyAndRest);
  if (mapped === undefined) {
    // Mapper-undefined → verbatim (no blanket) — preserves manifest.json, bare dirs, hooks/hooks.json
    return segment;
  }

  // Defined → blanket-rewrite the converted .claude/... path, then reattach punctuation
  return brandRewrite(blanketRewrite(mapped, settings), settings) + (trailingSlash ? '/' : '') + suffix;
}

function claudeFamilyRoot(plugin: string, family: string, settings: PrefixTransformSettings): string | undefined {
  switch (family) {
    case 'skills':
    case 'agents':
    case 'commands':
    case 'lib':
      return posixTargetPath('.claude', family);
    case 'scripts':
      return brandRewrite(blanketRewrite(claudeTargetMapper.scriptRoot(plugin), settings), settings);
    case 'hooks':
      return brandRewrite(blanketRewrite(claudeTargetMapper.hookRoot(plugin), settings), settings);
    default:
      return undefined;
  }
}

export function transformTextContent(text: string, settings: PrefixTransformSettings): string {
  let result = '';
  let lastIndex = 0;

  SOURCE_PLUGIN_PATH.lastIndex = 0;
  for (const match of text.matchAll(SOURCE_PLUGIN_PATH)) {
    const index = match.index ?? 0;
    // Unprotected region between last match and this match → blanket only
    result += brandRewrite(blanketRewrite(text.slice(lastIndex, index), settings), settings);
    // Matched .specify/plugins/... segment → convert+blanket or verbatim
    result += convertSourceSegment(match[0]!, settings);
    lastIndex = index + match[0]!.length;
  }

  // Trailing unprotected region → blanket only
  result += brandRewrite(blanketRewrite(text.slice(lastIndex), settings), settings);
  return result;
}

export function transformFileContent(sourcePath: string, content: Buffer, settings: PrefixTransformSettings): Buffer {
  if (!isTextTransformCandidate(sourcePath)) return content;
  return Buffer.from(transformTextContent(content.toString('utf-8'), settings), 'utf-8');
}

export function transformHookDeclaration(value: unknown, settings: PrefixTransformSettings): unknown {
  if (typeof value === 'string') return transformTextContent(value, settings);
  if (Array.isArray(value)) return value.map((item) => transformHookDeclaration(item, settings));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = transformHookDeclaration(item, settings);
    return result;
  }
  return value;
}

export function transformHookHandler(handler: HookHandler, settings: PrefixTransformSettings): HookHandler {
  return transformHookDeclaration(handler, settings) as HookHandler;
}
