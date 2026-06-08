import * as path from 'node:path';
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
const SOURCE_PLUGIN_PATH = /(?:\.\/)?\.specify\/plugins\/[^\s"'`<>)\]}]+/g;

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
  const normalized = targetRelativePath.split(/[\\/]/);
  const familyIndex = normalized.findIndex((part) => part === 'skills' || part === 'agents' || part === 'commands');
  if (familyIndex !== -1 && normalized[familyIndex + 1]) {
    normalized[familyIndex + 1] = rewriteName(normalized[familyIndex + 1]!, settings);
  }
  if (normalized[0] === '.claude' && (normalized[1] === 'scripts' || normalized[1] === 'hooks') && normalized[2]) {
    normalized[2] = rewriteName(normalized[2], settings);
  }
  return path.join(...normalized);
}

export function isTextTransformCandidate(filePath: string): boolean {
  const name = path.basename(filePath);
  if (EXCLUDED_NAMES.has(name)) return false;
  return TEXT_EXTENSIONS.has(path.extname(filePath));
}

function transformUnprotectedText(text: string, entries: Array<[string, string]>): string {
  let result = text;
  for (const [source, target] of entries) {
    result = result.replace(new RegExp(escapeRegExp(source), 'g'), target);
  }
  return result;
}

export function transformTextContent(text: string, rewriteMap: Map<string, string>): string {
  const entries = [...rewriteMap.entries()].sort((a, b) => b[0].length - a[0].length);
  let result = '';
  let lastIndex = 0;

  SOURCE_PLUGIN_PATH.lastIndex = 0;
  for (const match of text.matchAll(SOURCE_PLUGIN_PATH)) {
    const index = match.index ?? 0;
    result += transformUnprotectedText(text.slice(lastIndex, index), entries);
    result += match[0];
    lastIndex = index + match[0].length;
  }

  result += transformUnprotectedText(text.slice(lastIndex), entries);
  return result;
}

export function transformFileContent(sourcePath: string, content: Buffer, rewriteMap: Map<string, string>): Buffer {
  if (!isTextTransformCandidate(sourcePath) || rewriteMap.size === 0) return content;
  return Buffer.from(transformTextContent(content.toString('utf-8'), rewriteMap), 'utf-8');
}

export function transformHookDeclaration(value: unknown, rewriteMap: Map<string, string>): unknown {
  if (typeof value === 'string') return transformTextContent(value, rewriteMap);
  if (Array.isArray(value)) return value.map((item) => transformHookDeclaration(item, rewriteMap));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) result[key] = transformHookDeclaration(item, rewriteMap);
    return result;
  }
  return value;
}

export function transformHookHandler(handler: HookHandler, rewriteMap: Map<string, string>): HookHandler {
  return transformHookDeclaration(handler, rewriteMap) as HookHandler;
}
