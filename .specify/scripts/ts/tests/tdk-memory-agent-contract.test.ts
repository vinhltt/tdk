import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '../../../..');
const SPECIFY_DIR = resolve(PROJECT_ROOT, '.specify');
const PLUGINS_DIR = resolve(import.meta.dir, '../../../plugins');
const SPECIFY_DOCS_DIR = resolve(SPECIFY_DIR, 'docs');
const README = resolve(PROJECT_ROOT, 'README.md');
const AGENT = resolve(PLUGINS_DIR, 'tdk-memory/agents/tdk-memory-agent.md');
const LEGACY_ACTIVE_TERMS = ['memory-guardian', 'tdk-memory-preload'];
const LEGACY_OBSIDIAN_TERMS = [
  'mcp__smart-obsidian__',
  'smart-obsidian',
  'obsidian_simple_search',
  'obsidian_complex_search',
  'obsidian_batch_get_file_contents',
];
const MEMORY_SOURCE_DIR = resolve(PLUGINS_DIR, 'tdk-memory');
const PLAN_SOURCE_DIR = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-plan');
const ALLOWED_HISTORICAL_LINES: Record<string, string[]> = {
  [resolve(PLUGINS_DIR, 'tdk-memory/CHANGELOG.md')]: [
    '- Removed legacy memory components: memory-guardian agent (was 0.1.2) and tdk-memory-preload skill (was 0.0.8)',
  ],
};


function markdownSection(content: string, heading: string): string {
  const start = content.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = start + heading.length;
  const headingLevel = heading.match(/^#+/)?.[0].length ?? 1;
  const nextSectionPattern = new RegExp(`\\n#{1,${headingLevel}} `);
  const nextSection = content.slice(bodyStart).search(nextSectionPattern);
  return nextSection === -1 ? content.slice(start) : content.slice(start, bodyStart + nextSection);
}

function walkPaths(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  if (basename(path) === 'tests') return [];

  const results = [path];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    results.push(...walkPaths(join(path, entry.name)));
  }
  return results;
}


function findTermViolations(paths: string[], terms: string[]): string[] {
  const violations: string[] = [];

  for (const path of paths.flatMap(walkPaths)) {
    const relativePath = relative(PROJECT_ROOT, path);
    for (const term of terms) {
      if (relativePath.includes(term)) {
        violations.push(`${relativePath}: path contains ${term}`);
      }
    }

    if (!statSync(path).isFile()) continue;
    const content = readFileSync(path, 'utf-8');
    content.split(/\r?\n/).forEach((line, index) => {
      for (const term of terms) {
        if (line.includes(term) && !ALLOWED_HISTORICAL_LINES[path]?.includes(line.trim())) {
          violations.push(`${relativePath}:${index + 1}: contains ${term}`);
        }
      }
    });
  }

  return violations;
}

describe('tdk-memory cross-plugin agent contract', () => {
  it('keeps stale memory agent names out of active TDK source artifacts', () => {
    const activeSurfaces = [PLUGINS_DIR, SPECIFY_DOCS_DIR, README];
    const violations = findTermViolations(activeSurfaces, LEGACY_ACTIVE_TERMS);

    expect(violations).toEqual([]);
  });

  it('keeps the active memory and plan surfaces off legacy smart-obsidian tools', () => {
    const activeSurfaces = [MEMORY_SOURCE_DIR, PLAN_SOURCE_DIR];
    const violations = findTermViolations(activeSurfaces, LEGACY_OBSIDIAN_TERMS);

    expect(violations).toEqual([]);
  });

  it('routes source-based consistency evidence through tdk-consistency-check', () => {
    const content = readFileSync(AGENT, 'utf-8');
    const crossReference = markdownSection(content, '### Phase 3: Cross-reference against memory');

    expect(crossReference).toContain('Do not read, open, or reason about application source code');
    expect(crossReference).toContain('`NOT CHECKED`; source-claim');
    expect(crossReference).toContain('/tdk-consistency-check --deep` Pass K');
  });
});
