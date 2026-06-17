import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '../../../..');
const SPECIFY_DIR = resolve(PROJECT_ROOT, '.specify');
const PLUGINS_DIR = resolve(import.meta.dir, '../../../plugins');
const CODEX_PLUGINS_DIR = resolve(SPECIFY_DIR, 'codex-plugins');
const SPECIFY_DOCS_DIR = resolve(SPECIFY_DIR, 'docs');
const README = resolve(PROJECT_ROOT, 'README.md');
const AGENT = resolve(PLUGINS_DIR, 'tdk-memory/agents/tdk-memory-agent.md');
const OLD_AGENT = resolve(PLUGINS_DIR, 'tdk-memory/agents/memory-guardian.md');
const TDK_SPECIFY = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-specify/SKILL.md');
const TDK_CLARIFY = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-clarify/SKILL.md');
const TDK_ANALYZE = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-analyze/SKILL.md');
const TDK_PLAN = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-plan/SKILL.md');
const TDK_PLAN_GATES = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-plan/references/gates.md');
const LEGACY_ACTIVE_TERMS = ['memory-guardian', 'tdk-memory-preload'];
const ALLOWED_HISTORICAL_LINES = new Map([
  [
    resolve(PLUGINS_DIR, 'tdk-memory/CHANGELOG.md'),
    ['- Removed legacy memory components: memory-guardian agent (was 0.1.2) and tdk-memory-preload skill (was 0.0.8)'],
  ],
]);

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function markdownSection(content: string, heading: string): string {
  const start = content.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = start + heading.length;
  const headingLevel = heading.match(/^#+/)?.[0].length ?? 1;
  const nextSectionPattern = new RegExp(`\\n#{1,${headingLevel}} `);
  const nextSection = content.slice(bodyStart).search(nextSectionPattern);
  return nextSection === -1 ? content.slice(start) : content.slice(start, bodyStart + nextSection);
}

function between(content: string, startMarker: string, endMarker: string): string {
  const start = content.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = content.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return content.slice(start, end);
}

/** Recursively collect all files under a directory. */
function walkFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function walkPaths(path: string): string[] {
  if (statSync(path).isFile()) return [path];

  const results = [path];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    results.push(...walkPaths(join(path, entry.name)));
  }
  return results;
}

function isAllowedHistoricalLine(file: string, line: string): boolean {
  return ALLOWED_HISTORICAL_LINES.get(file)?.includes(line.trim()) ?? false;
}

describe('tdk-memory-agent contract', () => {
  it('tdk-memory-agent.md exists and old memory-guardian.md is absent', () => {
    expect(existsSync(AGENT)).toBe(true);
    expect(existsSync(OLD_AGENT)).toBe(false);
  });

  it('contains --mode load and --mode validate sections', () => {
    const content = read(AGENT);
    expect(content).toContain('--mode load');
    expect(content).toContain('--mode validate');
  });

  it('contains all Context Block field tokens in both modes', () => {
    const content = read(AGENT);
    const tokens = [
      '=== MEMORY CONTEXT BLOCK ===',
      'Domains loaded',
      '### Business Rules',
      '### Services / API',
      '### Known Flows',
      '## Data Models',
      '## Related Screens',
      '## Constraints & Warnings',
      '=== END MEMORY CONTEXT BLOCK ===',
    ];
    for (const token of tokens) {
      expect(content).toContain(token);
    }
  });

  it('emits Context Block in load section and validate references reuse', () => {
    const content = read(AGENT);
    // Use section headings to locate the mode boundaries
    const loadSectionStart = content.indexOf('## Mode: load');
    const validateSectionStart = content.indexOf('## Mode: validate');
    expect(loadSectionStart).toBeGreaterThanOrEqual(0);
    expect(validateSectionStart).toBeGreaterThan(loadSectionStart);

    // Context Block opener appears in the load section (before validate section)
    const blockOpenerInLoad = content.indexOf('=== MEMORY CONTEXT BLOCK ===', loadSectionStart);
    expect(blockOpenerInLoad).toBeGreaterThan(loadSectionStart);
    expect(blockOpenerInLoad).toBeLessThan(validateSectionStart);

    // Validate section references reusing the passed Context Block
    const validateSection = content.slice(validateSectionStart);
    expect(validateSection).toContain('Context Block');
  });

  it('active TDK artifacts do not reference stale memory agent names as current behavior', () => {
    const activeSurfaces = [PLUGINS_DIR, CODEX_PLUGINS_DIR, SPECIFY_DOCS_DIR, README];
    const violations: string[] = [];

    for (const path of activeSurfaces.flatMap(walkPaths)) {
      const relativePath = relative(PROJECT_ROOT, path);
      for (const term of LEGACY_ACTIVE_TERMS) {
        if (relativePath.includes(term)) {
          violations.push(`${relativePath}: path contains ${term}`);
        }
      }

      if (!statSync(path).isFile()) continue;
      const content = readFileSync(path, 'utf-8');
      content.split(/\r?\n/).forEach((line, index) => {
        for (const term of LEGACY_ACTIVE_TERMS) {
          if (line.includes(term) && !isAllowedHistoricalLine(path, line)) {
            violations.push(`${relativePath}:${index + 1}: contains ${term}`);
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('defines Guardian Report taxonomy and action values', () => {
    const content = read(AGENT);
    const reportTemplate = between(content, '### Phase 4: Render Guardian Report', '### Phase 5: Post-report action signal');
    expect(reportTemplate).toContain('=== GUARDIAN REPORT ===');
    expect(reportTemplate).toContain('## CONFLICTS (must resolve before implement)');
    expect(reportTemplate).toContain('## WARNINGS (should review)');
    expect(reportTemplate).toContain('CONFLICTS: {N} | WARNINGS: {N} | OK: {N} | NOT CHECKED: {N}');
    expect(reportTemplate).toContain('Action required: {BLOCK_IMPL if CONFLICTS > 0 | REVIEW if WARNINGS > 0 and no CONFLICTS | CLEAR}');
  });

  it('tdk-specify validates raw requirements and persists accepted resolutions', () => {
    const content = read(TDK_SPECIFY);
    const memoryStep = markdownSection(content, '### Step 0.memory');
    expect(memoryStep).toContain('--mode validate');
    expect(memoryStep).not.toContain('--mode load');
    expect(memoryStep).toContain('Guardian Report');
    expect(memoryStep).toContain('Action required: BLOCK_IMPL');
    expect(memoryStep).toContain('Action required: REVIEW');
    expect(memoryStep).toContain('Action required: CLEAR');
    expect(memoryStep).toContain('AskUserQuestion');
    expect(memoryStep).toContain('business-conflict');
    expect(memoryStep).toContain('warnings');
    expect(memoryStep).toContain('MEMORY_VALIDATE_REPORT');
    expect(memoryStep).toContain('MEMORY_RESOLUTIONS');
    expect(memoryStep).toContain('## Clarifications');
    expect(memoryStep).toContain('STATUS: MCP_UNAVAILABLE');
    expect(memoryStep).toContain('memory_context_loaded: false');
  });

  it('tdk-clarify uses Guardian Report findings for clarification questions', () => {
    const content = read(TDK_CLARIFY);
    const memoryStep = markdownSection(content, '### Step 0.memory');
    expect(memoryStep).toContain('--mode validate');
    expect(memoryStep).not.toContain('--mode load');
    expect(memoryStep).toContain('Guardian Report');
    expect(memoryStep).toContain('conflicts -> clarification questions');
    expect(memoryStep).toContain('warnings -> optional review questions');
    expect(memoryStep).toContain('## Clarifications');
    expect(memoryStep).toContain('do not ask again');
    expect(memoryStep).toContain('STATUS: MCP_UNAVAILABLE');
    expect(content).not.toContain('CONSTRAINTS & WARNINGS from Context Block');
  });

  it('tdk-analyze writes Guardian Report findings into analysis output', () => {
    const content = read(TDK_ANALYZE);
    const memoryStep = markdownSection(content, '### Step 0.memory');
    expect(memoryStep).toContain('--mode validate');
    expect(memoryStep).not.toContain('--mode load');
    expect(memoryStep).toContain('Guardian Report');
    expect(memoryStep).toContain('spec + plan');
    expect(memoryStep).toContain('spec-only');
    expect(memoryStep).toContain('Memory Validation');
    expect(memoryStep).toContain('conflicts -> high-priority findings');
    expect(memoryStep).toContain('warnings -> review findings');
    expect(memoryStep).toContain('STATUS: MCP_UNAVAILABLE');
    expect(memoryStep).not.toContain('AskUserQuestion');
  });

  it('tdk-plan preserves memory preload and guardian gate behavior', () => {
    const planContent = read(TDK_PLAN);
    const topLevelPreloadStep = markdownSection(planContent, '### Step 0.memory');
    const topLevelGuardianStep = markdownSection(planContent, '### Phase 0.guardian');
    expect(topLevelPreloadStep).toContain('Context Block');
    expect(topLevelGuardianStep).toContain('--mode validate');
    expect(topLevelGuardianStep).toContain('Guardian Report');
    expect(topLevelGuardianStep).toContain('BLOCK_IMPL');
    expect(topLevelGuardianStep).toContain('REVIEW');
    expect(topLevelGuardianStep).toContain('CLEAR');
    expect(topLevelGuardianStep).toContain('STATUS: MCP_UNAVAILABLE');

    const gatesContent = read(TDK_PLAN_GATES);
    const gatesPreloadStep = markdownSection(gatesContent, '## Memory Pre-load (Step 0.memory)');
    const gatesGuardianStep = markdownSection(gatesContent, '## Phase 0.guardian');
    expect(gatesPreloadStep).toContain('--mode load');
    expect(gatesPreloadStep).not.toContain('Spawn `tdk-memory-agent` agent with `--mode validate`');
    expect(gatesPreloadStep).toContain('Context Block');
    expect(gatesGuardianStep).toContain('--mode validate');
    expect(gatesGuardianStep).toContain('Guardian Report');
    expect(gatesGuardianStep).toContain('BLOCK_IMPL');
    expect(gatesGuardianStep).toContain('REVIEW');
    expect(gatesGuardianStep).toContain('CLEAR');
    expect(gatesGuardianStep).toContain('STATUS: MCP_UNAVAILABLE');
  });
});
