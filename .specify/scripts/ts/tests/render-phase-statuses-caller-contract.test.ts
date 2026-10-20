import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dir, '../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

// Phase-row writes must go through renderPlanStatuses so the plan root and spec
// lifecycle status stay in sync. Only the parser (definition + its thin
// updatePhaseStatus wrapper) and the lifecycle choke point may call the raw renderer.
describe('renderPhaseStatuses caller contract', () => {
  it('has no direct src caller outside the parser and plan-root-status', () => {
    const allowed = new Set(['commands/util/phases-table-parser.ts', 'commands/util/plan-root-status.ts']);
    const callers = sourceFiles(SRC)
      .filter((path) => /\b(renderPhaseStatuses|updatePhaseStatus)\(/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path).split('\\').join('/'))
      .sort();
    expect(callers.filter((path) => !allowed.has(path))).toEqual([]);
    expect(callers).toContain('commands/util/plan-root-status.ts');
  });
});
