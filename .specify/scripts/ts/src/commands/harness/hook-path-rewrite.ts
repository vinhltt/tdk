import * as path from 'node:path';
import type { HookHandler } from './types';

const SUPPORTED_HOOK_TYPES = new Set(['command', 'http', 'mcp_tool', 'prompt', 'agent']);
const PATH_END = /[\s"'`]/;

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = sortJson((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}

export function normalizeHookHandler(handler: HookHandler): string {
  return JSON.stringify(sortJson(handler));
}

function validatePluginRelativePath(relativePath: string, original: string): void {
  const segments = relativePath.split('/');
  if (
    relativePath.length === 0 ||
    relativePath.includes('\\') ||
    path.posix.isAbsolute(relativePath) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
    path.posix.normalize(relativePath).startsWith('../')
  ) {
    throw new Error(`Unsafe plugin hook path reference: ${original}`);
  }
}

function rewritePrefixedPath(value: string, sourcePrefix: string, targetPrefix: string): string {
  let result = '';
  let index = 0;
  while (index < value.length) {
    const start = value.indexOf(sourcePrefix, index);
    if (start === -1) {
      result += value.slice(index);
      break;
    }

    const pathStart = start + sourcePrefix.length;
    let pathEnd = pathStart;
    while (pathEnd < value.length && !PATH_END.test(value[pathEnd]!)) pathEnd += 1;

    const relativePath = value.slice(pathStart, pathEnd);
    validatePluginRelativePath(relativePath, value);
    result += value.slice(index, start) + targetPrefix + relativePath;
    index = pathEnd;
  }
  return result;
}

function rewriteString(value: string, plugin: string): string {
  const withHooks = rewritePrefixedPath(
    value,
    '${CLAUDE_PLUGIN_ROOT}/hooks/',
    `\${CLAUDE_PROJECT_DIR}/.claude/hooks/${plugin}/`,
  );
  const rewritten = rewritePrefixedPath(
    withHooks,
    '${CLAUDE_PLUGIN_ROOT}/scripts/',
    `\${CLAUDE_PROJECT_DIR}/.claude/scripts/${plugin}/`,
  );

  if (
    rewritten.includes('${CLAUDE_PLUGIN_ROOT}') ||
    rewritten.includes('${CLAUDE_PLUGIN_DATA}') ||
    rewritten.includes('${user_config.')
  ) {
    throw new Error(`Unsupported plugin-only hook reference: ${value}`);
  }

  return rewritten;
}

function rewriteValue(value: unknown, plugin: string): unknown {
  if (typeof value === 'string') return rewriteString(value, plugin);
  if (Array.isArray(value)) return value.map((item) => rewriteValue(item, plugin));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = rewriteValue(item, plugin);
    }
    return result;
  }
  return value;
}

function requireString(handler: HookHandler, field: string): void {
  if (typeof handler[field] !== 'string' || handler[field].trim() === '') {
    throw new Error(`Hook type "${handler.type}" requires string field "${field}"`);
  }
}

function validateRequiredFields(handler: HookHandler): void {
  switch (handler.type) {
    case 'command':
      requireString(handler, 'command');
      return;
    case 'http':
      requireString(handler, 'url');
      return;
    case 'mcp_tool':
      requireString(handler, 'server');
      requireString(handler, 'tool');
      return;
    case 'prompt':
    case 'agent':
      requireString(handler, 'prompt');
      return;
  }
}

function usesExecForm(handler: HookHandler): boolean {
  return Array.isArray(handler.args) || handler.shell === false;
}

export function rewriteHookHandler(plugin: string, handler: HookHandler): HookHandler {
  if (!SUPPORTED_HOOK_TYPES.has(handler.type)) {
    throw new Error(`Unsupported hook type "${handler.type}"`);
  }
  validateRequiredFields(handler);

  const rewritten = rewriteValue(handler, plugin) as HookHandler;
  if (
    handler.type === 'command' &&
    typeof handler.command === 'string' &&
    handler.command.includes('${CLAUDE_PLUGIN_ROOT}/') &&
    typeof rewritten.command === 'string' &&
    !usesExecForm(handler) &&
    !rewritten.command.trim().startsWith('cd ')
  ) {
    rewritten.command = `cd "$CLAUDE_PROJECT_DIR" && ${rewritten.command.trim()}`;
  }
  return rewritten;
}
