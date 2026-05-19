// Language parser dispatcher: extension → LanguageParser.

import type { LanguageParser } from '../types';
import { tsJsParser } from './ts-js';
import { pythonParser } from './python';
import { goParser } from './go';

const EXT_MAP: Record<string, LanguageParser> = {
  '.ts': tsJsParser,
  '.tsx': tsJsParser,
  '.js': tsJsParser,
  '.jsx': tsJsParser,
  '.mjs': tsJsParser,
  '.cjs': tsJsParser,
  '.py': pythonParser,
  '.go': goParser,
};

export function getParser(filePath: string): LanguageParser | null {
  const lower = filePath.toLowerCase();
  for (const [ext, parser] of Object.entries(EXT_MAP)) {
    if (lower.endsWith(ext)) return parser;
  }
  return null;
}
