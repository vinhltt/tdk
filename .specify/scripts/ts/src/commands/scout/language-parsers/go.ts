// Go parser: imports (single + grouped), funcs, types.

import type { LanguageParser } from '../types';

const IMPORT_SINGLE_RE = /^\s*import\s+(?:\w+\s+)?["']([^"']+)["']/gm;
const IMPORT_GROUP_RE = /^\s*import\s*\(([\s\S]*?)\)/gm;
const FUNC_RE = /^\s*func\s+(?:\([^)]+\)\s+)?(\w+)/gm;
const TYPE_RE = /^\s*type\s+(\w+)/gm;
const QUOTED_PATH_RE = /(?:\w+\s+)?["']([^"']+)["']/;

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

export const goParser: LanguageParser = {
  extractImports(body: string): string[] {
    const items: string[] = [];
    for (const m of body.matchAll(IMPORT_SINGLE_RE)) {
      if (m[1]) items.push(m[1]);
    }
    for (const m of body.matchAll(IMPORT_GROUP_RE)) {
      const inner = m[1] ?? '';
      for (const line of inner.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//')) continue;
        const match = QUOTED_PATH_RE.exec(trimmed);
        if (match && match[1]) items.push(match[1]);
      }
    }
    return uniq(items);
  },
  extractExports(body: string): string[] {
    const items: string[] = [];
    for (const m of body.matchAll(FUNC_RE)) {
      const name = m[1];
      if (name && /^[A-Z]/.test(name)) items.push(name);
    }
    for (const m of body.matchAll(TYPE_RE)) {
      const name = m[1];
      if (name && /^[A-Z]/.test(name)) items.push(name);
    }
    return uniq(items);
  },
  extractSymbols(body: string): string[] {
    const items: string[] = [];
    items.push(...Array.from(body.matchAll(FUNC_RE), (m) => m[1] ?? ''));
    items.push(...Array.from(body.matchAll(TYPE_RE), (m) => m[1] ?? ''));
    return uniq(items);
  },
};
