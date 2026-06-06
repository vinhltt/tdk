/**
 * plan-prose-validator.test.ts
 *
 * Tests for the plan-prose-validator module.
 * Inline string fixtures (no /tests/fixtures files) — validator is a pure function.
 */

import { describe, it, expect } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validatePlanProse,
  type ProseValidationResult,
} from '../src/commands/util/plan-prose-validator';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const CLEAN_PLAN = `# Plan

## Problem

Some problem description here that is prose. This section is NOT guarded.

## Phases

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|
| 01 | [phase-01](./phase-01.md) | todo | — | — |

## Decisions Made

| Decision | Chosen | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Foo | A | B | C |

## Success Metrics

- [ ] Metric A passes
- [ ] Metric B passes
`;

const PROSE_IN_PHASES = `# Plan

## Phases

This is a freeform prose paragraph that should be rejected by the validator.

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|
| 01 | [phase-01](./phase-01.md) | todo | — | — |

## Success Metrics

- [ ] Metric A
`;

const PROSE_IN_DECISIONS = `# Plan

## Phases

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|
| 01 | [phase-01](./phase-01.md) | todo | — | — |

## Decisions Made

We decided to do X because Y. That is a narrative paragraph.

| Decision | Chosen | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Foo | A | B | C |
`;

const PROSE_IN_METRICS = `# Plan

## Phases

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|
| 01 | [phase-01](./phase-01.md) | todo | — | — |

## Success Metrics

The system shall be performant and reliable across all scenarios.

- [ ] Metric A
`;

// ---------------------------------------------------------------------------
// describe: validatePlanProse — happy paths
// ---------------------------------------------------------------------------

describe('validatePlanProse — happy paths', () => {
  it('1. happy_clean_plan: returns ok=true for clean plan', () => {
    const result = validatePlanProse(CLEAN_PLAN);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('5. happy_metrics_bullet_list: bullets allowed in Success Metrics', () => {
    const md = `## Success Metrics

- metric A passes
- metric B passes
* metric C
+ metric D
`;
    const result = validatePlanProse(md);
    expect(result.ok).toBe(true);
  });

  it('6. happy_metrics_checkbox: checkboxes allowed', () => {
    const md = `## Success Metrics

- [ ] metric A passes
- [x] metric B passes
`;
    const result = validatePlanProse(md);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// describe: validatePlanProse — prose detection
// ---------------------------------------------------------------------------

describe('validatePlanProse — prose detection', () => {
  it('2. bug_phases_paragraph: detects prose in ## Phases', () => {
    const result = validatePlanProse(PROSE_IN_PHASES);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    const v = result.violations[0]!;
    expect(v.section).toBe('## Phases');
    expect(v.line).toBeGreaterThan(0);
    expect(v.snippet).toContain('freeform prose');
  });

  it('3. bug_decisions_paragraph: detects prose in ## Decisions Made', () => {
    const result = validatePlanProse(PROSE_IN_DECISIONS);
    expect(result.ok).toBe(false);
    const v = result.violations[0]!;
    expect(v.section).toBe('## Decisions Made');
    expect(v.snippet).toContain('decided to do X');
  });

  it('4. bug_metrics_paragraph: detects prose in ## Success Metrics', () => {
    const result = validatePlanProse(PROSE_IN_METRICS);
    expect(result.ok).toBe(false);
    const v = result.violations[0]!;
    expect(v.section).toBe('## Success Metrics');
    expect(v.snippet).toContain('performant and reliable');
  });
});

// ---------------------------------------------------------------------------
// describe: validatePlanProse — edge cases
// ---------------------------------------------------------------------------

describe('validatePlanProse — edge cases', () => {
  it('7. edge_empty_table: header row only is ok', () => {
    const md = `## Phases

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|
`;
    const result = validatePlanProse(md);
    expect(result.ok).toBe(true);
  });

  it('8. edge_section_is_last: guarded section at EOF is ok', () => {
    const md = `## Phases

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|
| 01 | [p](./p.md) | todo | — | — |`;
    const result = validatePlanProse(md);
    expect(result.ok).toBe(true);
  });

  it('9. edge_sub_heading_allowed: ### subgroup inside guarded section', () => {
    const md = `## Decisions Made

### Subgroup A

| Decision | Chosen | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Foo | A | B | C |

#### Sub-sub

- bullet
`;
    const result = validatePlanProse(md);
    expect(result.ok).toBe(true);
  });

  it('10. edge_mrr_2067_repro: long paragraph snippet truncated to 80 chars', () => {
    const longProse = 'X'.repeat(10000);
    const md = `## Phases

${longProse}

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|
`;
    const result = validatePlanProse(md);
    expect(result.ok).toBe(false);
    const v = result.violations[0]!;
    expect(v.snippet.length).toBeLessThanOrEqual(80);
  });

  it('11. edge_non_guarded_section_ignored: prose in ## Problem is ok', () => {
    const md = `## Problem

This is freeform prose in an UNGUARDED section. Should be ignored.

## Phases

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|
`;
    const result = validatePlanProse(md);
    expect(result.ok).toBe(true);
  });

  it('12. edge_missing_guarded_section: missing section is ok (skip)', () => {
    const md = `## Phases

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|

## Success Metrics

- [ ] metric A
`;
    // ## Decisions Made is missing entirely — should not raise violations
    const result = validatePlanProse(md);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// describe: validatePlanProse — output shape
// ---------------------------------------------------------------------------

describe('validatePlanProse — output shape', () => {
  it('returns ProseValidationResult shape', () => {
    const result: ProseValidationResult = validatePlanProse(CLEAN_PLAN);
    expect(typeof result.ok).toBe('boolean');
    expect(Array.isArray(result.violations)).toBe(true);
  });

  it('violation includes section, line (1-based), snippet', () => {
    const result = validatePlanProse(PROSE_IN_PHASES);
    const v = result.violations[0]!;
    expect(typeof v.section).toBe('string');
    expect(typeof v.line).toBe('number');
    expect(v.line).toBeGreaterThan(0);
    expect(typeof v.snippet).toBe('string');
  });

  it('normalizes CRLF line endings', () => {
    const md = CLEAN_PLAN.replace(/\n/g, '\r\n');
    const result = validatePlanProse(md);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// describe: CLI JSON output
// ---------------------------------------------------------------------------

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const cli = join(import.meta.dir, '../src/commands/util/plan-prose-validator.ts');
  const proc = Bun.spawn(['bun', cli, ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

describe('plan-prose-validator CLI', () => {
  it('--json emits compact JSON', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'tdk-plan-prose-'));
    try {
      const planPath = join(tempDir, 'plan.md');
      writeFileSync(planPath, CLEAN_PLAN);

      const { exitCode, stdout } = await runCli([planPath, '--json']);
      const result = JSON.parse(stdout);

      expect(exitCode).toBe(0);
      expect(result.ok).toBe(true);
      expect(stdout).toBe(`${JSON.stringify(result)}\n`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
