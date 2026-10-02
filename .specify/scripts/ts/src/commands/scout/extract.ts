// Tier 1 orchestrator: pack file → Tier1Result JSON.
// Pure function (single side effect = atomic write to outputPath).

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import { splitPack } from './pack-splitter';
import { buildTree } from './tree-builder';
import { estimateTokens } from './tokens';
import { getParser } from './language-parsers/index';
import { aggregateTier1 } from './dir-aggregator';
import { MAX_SCOUT_FILES, TIER1_VERSION, type FileEntry, type Tier1Result } from './types';

export interface ExtractOptions {
  scope?: string;
}

export function extractPack(
  packPath: string,
  outputPath: string,
  opts: ExtractOptions = {},
): Tier1Result {
  const content = readFileSync(packPath, 'utf-8');
  const blocks = splitPack(content);

  const files: FileEntry[] = [];
  const unparsed: string[] = [];
  let totalLoc = 0;
  let totalTokens = 0;

  for (const block of blocks) {
    const loc = block.body ? block.body.split('\n').length : 0;
    const tokens = estimateTokens(block.body);
    const parser = getParser(block.path);

    let imports: string[] = [];
    let exports: string[] = [];
    let symbols: string[] = [];

    if (parser) {
      try {
        imports = parser.extractImports(block.body);
        exports = parser.extractExports(block.body);
        symbols = parser.extractSymbols(block.body);
      } catch {
        unparsed.push(block.path);
      }
    }

    files.push({ path: block.path, loc, tokens, imports, exports, symbols });
    totalLoc += loc;
    totalTokens += tokens;
  }

  const needsAggregation = files.length > MAX_SCOUT_FILES;
  let result: Tier1Result = {
    tier1Version: TIER1_VERSION,
    scope: opts.scope ?? basename(packPath, '.md'),
    totalFiles: files.length,
    totalLoc,
    totalTokens,
    tier1GeneratedAt: new Date().toISOString(),
    files,
    tree: needsAggregation ? {} : buildTree(files.map((f) => f.path)),
    unparsed,
  };
  if (needsAggregation) result = aggregateTier1(result, blocks);

  // Atomic write.
  mkdirSync(dirname(outputPath), { recursive: true });
  const tmp = `${outputPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(result, null, needsAggregation ? undefined : 2), 'utf-8');
  renameSync(tmp, outputPath);

  return result;
}
