// TS/JS parser: ESM imports, CJS requires, top-level exports.

import type { LanguageParser } from '../types';

const IMPORT_ESM_RE = /^\s*import\s+[\s\S]+?\s+from\s+['"]([^'"]+)['"]/gm;
const IMPORT_BARE_RE = /^\s*import\s+['"]([^'"]+)['"]/gm;
const REQUIRE_RE = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXPORT_NAMED_RE = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/gm;
const EXPORT_DEFAULT_NAMED_RE = /^\s*export\s+default\s+(?:async\s+)?(?:function|class)\s+(\w+)/gm;
const EXPORT_REEXPORT_RE = /^\s*export\s+\{\s*([^}]+)\}/gm;
const SYMBOL_RE = /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/gm;

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

function collectGroup(re: RegExp, body: string, group = 1): string[] {
  return Array.from(body.matchAll(re), (m) => m[group] ?? '').filter(Boolean);
}

export const tsJsParser: LanguageParser = {
  extractImports(body: string): string[] {
    const items: string[] = [];
    items.push(...collectGroup(IMPORT_ESM_RE, body));
    items.push(...collectGroup(IMPORT_BARE_RE, body));
    items.push(...collectGroup(REQUIRE_RE, body));
    return uniq(items);
  },
  extractExports(body: string): string[] {
    const items: string[] = [];
    items.push(...collectGroup(EXPORT_NAMED_RE, body));
    items.push(...collectGroup(EXPORT_DEFAULT_NAMED_RE, body));
    for (const m of body.matchAll(EXPORT_REEXPORT_RE)) {
      const inner = (m[1] ?? '').split(',').map((s) => s.trim().split(/\s+as\s+/)[0]?.trim()).filter(Boolean);
      items.push(...(inner as string[]));
    }
    return uniq(items);
  },
  extractSymbols(body: string): string[] {
    return uniq(collectGroup(SYMBOL_RE, body));
  },
};
