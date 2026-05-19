// Python parser: import / from-import, def, class.

import type { LanguageParser } from '../types';

const IMPORT_RE = /^\s*(?:from\s+([\w.]+)\s+)?import\s+([^\n#]+)/gm;
const DEF_RE = /^\s*(?:async\s+)?def\s+(\w+)/gm;
const CLASS_RE = /^\s*class\s+(\w+)/gm;

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

export const pythonParser: LanguageParser = {
  extractImports(body: string): string[] {
    const items: string[] = [];
    for (const m of body.matchAll(IMPORT_RE)) {
      const from = (m[1] ?? '').trim();
      const tail = (m[2] ?? '').trim();
      if (from) {
        items.push(from);
      } else {
        // `import a, b as B, c` → ['a', 'b', 'c']
        for (const part of tail.split(',')) {
          const name = part.trim().split(/\s+as\s+/)[0]?.trim();
          if (name) items.push(name);
        }
      }
    }
    return uniq(items);
  },
  extractExports(body: string): string[] {
    // Python has no explicit exports; treat top-level def/class names as exports.
    const items: string[] = [];
    for (const m of body.matchAll(DEF_RE)) {
      const name = m[1];
      if (name && !name.startsWith('_')) items.push(name);
    }
    for (const m of body.matchAll(CLASS_RE)) {
      const name = m[1];
      if (name && !name.startsWith('_')) items.push(name);
    }
    return uniq(items);
  },
  extractSymbols(body: string): string[] {
    const items: string[] = [];
    items.push(...Array.from(body.matchAll(DEF_RE), (m) => m[1] ?? ''));
    items.push(...Array.from(body.matchAll(CLASS_RE), (m) => m[1] ?? ''));
    return uniq(items);
  },
};
