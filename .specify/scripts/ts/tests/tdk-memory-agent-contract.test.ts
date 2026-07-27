import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '../../../..');
const SPECIFY_DIR = resolve(PROJECT_ROOT, '.specify');
const PLUGINS_DIR = resolve(import.meta.dir, '../../../plugins');
const SPECIFY_DOCS_DIR = resolve(SPECIFY_DIR, 'docs');
const README = resolve(PROJECT_ROOT, 'README.md');
const AGENT = resolve(PLUGINS_DIR, 'tdk-memory/agents/tdk-memory-agent.md');
const OLD_AGENT = resolve(PLUGINS_DIR, 'tdk-memory/agents/memory-guardian.md');
const TDK_SPECIFY_INPUT_ROUTING = resolve(
  PLUGINS_DIR,
  'tdk-core/skills/tdk-specify/references/input-routing-and-mode-workflow.md',
);
const TDK_CLARIFY = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-clarify/SKILL.md');
const TDK_ANALYZE = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-analyze/SKILL.md');
const TDK_PLAN = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-plan/SKILL.md');
const TDK_PLAN_GATES = resolve(PLUGINS_DIR, 'tdk-core/skills/tdk-plan/references/gates.md');
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
const OBSIDIAN_CONTRACT = resolve(
  PLUGINS_DIR,
  'tdk-memory/skills/_shared/obsidian-mcp-action-contract.md',
);
const MEMORY_UPDATE_ENRICHMENT_FLOWS = [
  resolve(PLUGINS_DIR, 'tdk-memory/skills/tdk-memory-update/references/flow-update-mcp.md'),
  resolve(PLUGINS_DIR, 'tdk-memory/skills/tdk-memory-update/references/flow-update-normal.md'),
];
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
        if (line.includes(term) && !isAllowedHistoricalLine(path, line)) {
          violations.push(`${relativePath}:${index + 1}: contains ${term}`);
        }
      }
    });
  }

  return violations;
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

  it('active TDK source artifacts do not reference stale memory agent names as current behavior', () => {
    const activeSurfaces = [PLUGINS_DIR, SPECIFY_DOCS_DIR, README];
    const violations = findTermViolations(activeSurfaces, LEGACY_ACTIVE_TERMS);

    expect(violations).toEqual([]);
  });

  it('active memory and plan source surfaces use the Obsidian action contract, not legacy smart-obsidian tools', () => {
    const activeSurfaces = [MEMORY_SOURCE_DIR, PLAN_SOURCE_DIR];
    const violations = findTermViolations(activeSurfaces, LEGACY_OBSIDIAN_TERMS);

    expect(violations).toEqual([]);
  });

  it('defines the shared Obsidian MCP action contract in the source plugin', () => {
    expect(existsSync(OBSIDIAN_CONTRACT), `${relative(PROJECT_ROOT, OBSIDIAN_CONTRACT)} should exist`).toBe(true);
    const content = read(OBSIDIAN_CONTRACT);

    expect(content).toContain('vault(action="list"');
    expect(content).toContain('vault(action="read"');
    expect(content).toContain('vault(action="search"');
    expect(content).toContain('edit(action="patch"');
    expect(content).toContain('STATUS: MCP_UNAVAILABLE');
  });

  it('keeps memory-update enrichment self-contained instead of loading legacy Obsidian helper skills', () => {
    for (const flowPath of MEMORY_UPDATE_ENRICHMENT_FLOWS) {
      const content = read(flowPath);

      expect(content).not.toContain('obsidian-brain');
      expect(content).toContain('Obsidian syntax enrichment rules');
      expect(content).toContain('wikilinks');
      expect(content).toContain('callouts');
      expect(content).toContain('block ID');
    }
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

  it('validates memory v3 typed categories without treating arc42 as binding evidence', () => {
    const content = read(AGENT);
    const crossReference = markdownSection(content, '### Phase 3: Cross-reference against memory');

    const requiredTokens = [
      'integrations/{integration-name}.md',
      'quality-requirements/{policy-name}.md',
      'operations/{runbook-name}-runbook.md',
      'quality-requirements/{quality-attribute}.md',
      'decisions/{decision-id}.md',
      'reports/{report-name}.md',
      'risks-and-debt/{risk-or-debt-id}.md',
      'decision-tables/{decision-table-name}.md',
      'state-machines/{state-machine-name}.md',
      'memory/integrations/{integration-name}.md',
      'memory/quality-requirements/',
      'memory/operations/',
      'memory/decisions/',
      'memory/reports/',
      'memory/risks-and-debt/',
    ];

    for (const token of requiredTokens) {
      expect(crossReference).toContain(token);
    }

    expect(crossReference).toContain('arc42/` summary files are non-binding');
    expect(crossReference).toContain('binding: false');
    expect(crossReference).toContain('binding: true');
    expect(crossReference).toContain('related.path');
    expect(crossReference).toContain('one hop');
    expect(crossReference).toContain('WARNINGS');
    expect(crossReference).toContain('NOT CHECKED');
  });

  it('tdk-specify validates raw requirements and persists accepted resolutions', () => {
    const content = read(TDK_SPECIFY_INPUT_ROUTING);
    const memoryStep = markdownSection(content, '## Step 0.memory');
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

  const BANNED_MEMORY_AGENT_PATTERNS = [
    ['best-effort ambiguous domain selection', 'best-effort'],
    ['entity/domain conflation via --domain {entity}', '--domain {entity}'],
    ['direct inferred data-model path shortcut', 'data-model/{entity}.md'],
  ] as const;

  it.each(BANNED_MEMORY_AGENT_PATTERNS)(
    'no longer relies on %s',
    (_label, bannedPattern) => {
      const content = read(AGENT);
      expect(content).not.toContain(bannedPattern);
    },
  );

  const REQUIRED_QUERY_OUTCOME_STATUSES = [
    'status: resolved',
    'status: warning_unverified',
    'status: warning_ambiguous',
    'status: not_found',
  ] as const;

  it.each(REQUIRED_QUERY_OUTCOME_STATUSES)(
    'documents agent handling for the %s outcome status',
    (status) => {
      const content = read(AGENT);
      expect(content).toContain(status);
    },
  );

  it('routes Load-mode MCP branch data-model resolution through tdk-memory-query instead of rebuilding direct vault reads', () => {
    const content = read(AGENT);
    const mcpLoadBranch = between(content, '**If `MCP_AVAILABLE=true`:**', '**If `MCP_AVAILABLE=false`:**');

    expect(mcpLoadBranch).toContain('tdk-memory-query');
  });

  it('requires binding: true confirmation before Guardian CONFLICTS and keeps non-resolved evidence non-blocking', () => {
    const content = read(AGENT);
    const crossReference = markdownSection(content, '### Phase 3: Cross-reference against memory');

    expect(crossReference).toContain('Confirm the evidence file is typed memory with `binding: true` before');
    expect(crossReference).toContain('If only `binding: false` summary context exists, use');
    expect(crossReference).toContain('`WARNINGS` or `NOT CHECKED`');
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

  it('builds one coherent entity-result cache before validation and never re-queries it in Phase 3', () => {
    const content = read(AGENT);
    const validateFlow = content.slice(content.indexOf('## Mode: validate'));
    const extraction = markdownSection(validateFlow, '### Phase 1: Extract validation claims and entities');
    const cacheFill = markdownSection(validateFlow, '### Phase 2: Build coherent memory snapshot and entity cache');
    const crossReference = markdownSection(validateFlow, '### Phase 3: Cross-reference against memory');

    expect(validateFlow.indexOf('### Phase 1: Extract validation claims and entities'))
      .toBeLessThan(validateFlow.indexOf('### Phase 2: Build coherent memory snapshot and entity cache'));
    expect(extraction).toContain('`EXTRACTED_ENTITIES`');
    expect(cacheFill).toContain('`ENTITY_RESULT_CACHE`');
    expect(cacheFill).toContain('`status: resolved` and `binding: true`');
    expect(cacheFill).toContain('`ENTITIES_TO_QUERY` to empty in this branch. Do not start a\n  second entity-query pass, including for a non-resolved outcome.');
    expect(cacheFill).toContain('When a Context Block is supplied, build `ENTITIES_TO_QUERY` from only missing or\n  unusable entities.');
    expect(cacheFill).toContain('For each entity in `ENTITIES_TO_QUERY`, exactly once');
    expect((cacheFill.match(/tdk-memory-query/g) ?? [])).toHaveLength(1);
    expect(cacheFill).toContain('Do not invoke the data-model resolver outside this cache-fill step.');
    expect(cacheFill).toContain('populate\n  the same `ENTITY_RESULT_CACHE` with their complete results.');
    expect(cacheFill).toContain('Do not start a\n  second entity-query pass, including for a non-resolved outcome.');

    expect(crossReference).toContain('Complete marker result in `ENTITY_RESULT_CACHE` for the exact entity');
    expect(crossReference).toContain('Complete marker result in `ENTITY_RESULT_CACHE["{entity}"]`');
    expect(crossReference).toContain('never invoke the resolver during Phase 3');
    expect(crossReference).toContain('do not invoke `tdk-memory-query` in Phase 3.');
    expect(crossReference).not.toContain('`tdk-memory-query "{entity}" --type data-model');
  });

  it('unescapes resolved marker bodies only after extracting their outer envelope', () => {
    const content = read(AGENT);
    const loadStep = markdownSection(content, '### Step 4: Load memory files');

    expect(loadStep).toContain('Locate only exact unescaped outer `MEMORY_QUERY_RESULT_START` and\n`MEMORY_QUERY_RESULT_END` lines.');
    expect(loadStep).toContain('after extracting its outer\nenvelope and `---` separator');
    expect(loadStep).toContain('remove exactly one leading');
    expect(loadStep).toContain('marker-only and pre-existing\nbackslash lines');
  });
});
