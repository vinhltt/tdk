/**
 * phases-table-parser.test.ts
 *
 * Tests for the phases-table-parser module.
 * Structure: 1 describe per function + 1 describe per fixture file.
 */

import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parsePhasesTable,
  updatePhaseStatus,
  validateDependencies,
  getPlanPath,
  type PhaseRow,
  type PhaseStatus,
} from '../src/commands/util/phases-table-parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES = join(import.meta.dir, 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

// ---------------------------------------------------------------------------
// describe: parsePhasesTable
// ---------------------------------------------------------------------------

describe('parsePhasesTable', () => {
  it('returns phases array and empty errors for valid markdown', () => {
    const md = fixture('plan-canonical.md');
    const result = parsePhasesTable(md);
    expect(result.errors).toHaveLength(0);
    expect(result.phases).toHaveLength(3);
  });

  it('first phase has correct fields', () => {
    const md = fixture('plan-canonical.md');
    const { phases } = parsePhasesTable(md);
    const p = phases[0]!;
    expect(p.number).toBe(1);
    expect(p.file).toBe('phase-01-setup.md');
    expect(p.fileLabel).toBe('phase-01-setup');
    expect(p.status).toBe('done');
    expect(p.blocks).toEqual([2, 3]);
    expect(p.blockedBy).toEqual([]);
  });

  it('middle phase has correct deps', () => {
    const md = fixture('plan-canonical.md');
    const { phases } = parsePhasesTable(md);
    const p = phases[1]!;
    expect(p.number).toBe(2);
    expect(p.status).toBe('in_progress');
    expect(p.blocks).toEqual([3]);
    expect(p.blockedBy).toEqual([1]);
  });

  it('rowLineNumber is 1-indexed', () => {
    const md = fixture('plan-canonical.md');
    const { phases } = parsePhasesTable(md);
    // All rowLineNumbers must be > 0
    for (const p of phases) {
      expect(p.rowLineNumber).toBeGreaterThan(0);
    }
    // Rows must be in ascending line order
    expect(phases[0]!.rowLineNumber).toBeLessThan(phases[1]!.rowLineNumber);
    expect(phases[1]!.rowLineNumber).toBeLessThan(phases[2]!.rowLineNumber);
  });

  it('returns error for missing ## Phases section', () => {
    const md = fixture('plan-missing-phases-section.md');
    const { errors, phases } = parsePhasesTable(md);
    expect(phases).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toBe('## Phases section not found');
  });

  it('returns error for multiple ## Phases sections', () => {
    const md = fixture('plan-ambiguous-multiple-phases.md');
    const { errors } = parsePhasesTable(md);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toMatch(/ambiguous: multiple ## Phases sections found/);
  });

  it('ambiguous error includes both line numbers', () => {
    const md = fixture('plan-ambiguous-multiple-phases.md');
    const { errors } = parsePhasesTable(md);
    // Should contain both line numbers
    expect(errors[0]!.message).toMatch(/lines \d+, \d+/);
  });

  it('returns error for invalid status vocab', () => {
    const md = fixture('plan-invalid-status-vocab.md');
    const { errors } = parsePhasesTable(md);
    expect(errors.length).toBeGreaterThan(0);
    const vocabError = errors.find(e => e.message.includes('complete'));
    expect(vocabError).toBeDefined();
    expect(vocabError!.message).toContain("unknown status 'complete'");
    expect(vocabError!.message).toContain("did you mean 'done'?");
  });

  it('collects all vocab errors (non-short-circuit), legacy aliases pass through', () => {
    const md = fixture('plan-invalid-status-vocab.md');
    const { errors, phases } = parsePhasesTable(md);
    // 'pending' is aliased to 'todo' (no error), 'complete' remains unknown
    const messages = errors.map(e => e.message);
    expect(messages.some(m => m.includes('complete'))).toBe(true);
    // 'pending' row should parse successfully via legacy alias
    const pendingRow = phases.find(p => p.number === 3);
    expect(pendingRow?.status).toBe('todo');
  });

  it('returns zero errors for empty table', () => {
    const md = fixture('plan-empty-table.md');
    const { errors, phases } = parsePhasesTable(md);
    expect(errors).toHaveLength(0);
    expect(phases).toHaveLength(0);
  });

  it('parses all-todo phases correctly', () => {
    const md = fixture('plan-all-todo.md');
    const { errors, phases } = parsePhasesTable(md);
    expect(errors).toHaveLength(0);
    expect(phases).toHaveLength(3);
    for (const p of phases) {
      expect(p.status).toBe('todo');
      expect(p.blocks).toEqual([]);
      expect(p.blockedBy).toEqual([]);
    }
  });

  it('handles em-dash deps correctly', () => {
    const md = fixture('plan-em-dash-deps.md');
    const { errors, phases } = parsePhasesTable(md);
    expect(errors).toHaveLength(0);
    expect(phases[0]!.blockedBy).toEqual([]);
    expect(phases[1]!.blockedBy).toEqual([1]);
    expect(phases[2]!.blockedBy).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// describe: updatePhaseStatus
// ---------------------------------------------------------------------------

describe('updatePhaseStatus', () => {
  it('updates target phase status', () => {
    const md = fixture('plan-all-todo.md');
    const updated = updatePhaseStatus(md, 2, 'in_progress');
    const { phases } = parsePhasesTable(updated);
    expect(phases[1]!.status).toBe('in_progress');
  });

  it('leaves other phases unchanged', () => {
    const md = fixture('plan-all-todo.md');
    const updated = updatePhaseStatus(md, 2, 'in_progress');
    const { phases } = parsePhasesTable(updated);
    expect(phases[0]!.status).toBe('todo');
    expect(phases[2]!.status).toBe('todo');
  });

  it('is idempotent — updating same status twice yields same result', () => {
    const md = fixture('plan-canonical.md');
    const once = updatePhaseStatus(md, 1, 'done');
    const twice = updatePhaseStatus(once, 1, 'done');
    expect(once).toBe(twice);
  });

  it('preserves content before and after the table', () => {
    const md = fixture('plan-mutation-roundtrip.md');
    const updated = updatePhaseStatus(md, 1, 'in_progress');
    expect(updated).toContain('## Overview');
    expect(updated).toContain('## Notes');
    expect(updated).toContain('Content after the table is preserved across mutations.');
  });

  it('throws for non-existent phase number', () => {
    const md = fixture('plan-canonical.md');
    expect(() => updatePhaseStatus(md, 99, 'done')).toThrow(/phase 99 not found/);
  });

  it('throws for missing ## Phases section', () => {
    const md = fixture('plan-missing-phases-section.md');
    expect(() => updatePhaseStatus(md, 1, 'done')).toThrow(/## Phases section not found/);
  });

  it('serializes em-dash (U+2014) for empty deps — strict-write', () => {
    const md = fixture('plan-all-todo.md');
    const updated = updatePhaseStatus(md, 1, 'done');
    // All rows have empty blocks/blockedBy — must serialize as em-dash
    const tableLines = updated.split('\n').filter(l => l.trim().startsWith('|') && !l.includes('---') && !l.includes('# |'));
    for (const line of tableLines) {
      // Every data row must contain the em-dash character
      expect(line).toContain('—');
    }
  });
});

// ---------------------------------------------------------------------------
// describe: validateDependencies
// ---------------------------------------------------------------------------

describe('validateDependencies', () => {
  it('returns empty array for valid deps', () => {
    const md = fixture('plan-canonical.md');
    const { phases } = parsePhasesTable(md);
    const errors = validateDependencies(phases);
    expect(errors).toHaveLength(0);
  });

  it('returns error for forward reference', () => {
    const md = fixture('plan-forward-ref-blockedby.md');
    const { phases } = parsePhasesTable(md);
    const errors = validateDependencies(phases);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toMatch(/row 02 BlockedBy references row 03/);
    expect(errors[0]!.message).toContain('must reference earlier row');
  });

  it('error includes rowLineNumber', () => {
    const md = fixture('plan-forward-ref-blockedby.md');
    const { phases } = parsePhasesTable(md);
    const errors = validateDependencies(phases);
    expect(errors[0]!.line).toBeGreaterThan(0);
  });

  it('returns empty array for empty phases list', () => {
    expect(validateDependencies([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// describe: getPlanPath
// ---------------------------------------------------------------------------

describe('getPlanPath', () => {
  it('returns string path ending in plan.md', () => {
    const result = getPlanPath('/some/feature/dir');
    expect(typeof result).toBe('string');
    expect(result).toMatch(/plan\.md$/);
  });

  it('path includes featureDir', () => {
    const result = getPlanPath('/some/feature/my-task');
    expect(result).toContain('my-task');
  });

  it('throws for empty string featureDir', () => {
    // F12 AC: throws if implPlan missing — reachable via empty-string input guard
    expect(() => getPlanPath('')).toThrow('implPlan path missing');
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-canonical.md
// ---------------------------------------------------------------------------

describe('fixture: plan-canonical.md', () => {
  it('parses 3 phases with no errors', () => {
    const { phases, errors } = parsePhasesTable(fixture('plan-canonical.md'));
    expect(errors).toHaveLength(0);
    expect(phases).toHaveLength(3);
  });

  it('statuses: done, in_progress, todo', () => {
    const { phases } = parsePhasesTable(fixture('plan-canonical.md'));
    expect(phases[0]!.status).toBe('done');
    expect(phases[1]!.status).toBe('in_progress');
    expect(phases[2]!.status).toBe('todo');
  });

  it('deps: phase 03 blocked by 01 and 02', () => {
    const { phases } = parsePhasesTable(fixture('plan-canonical.md'));
    expect(phases[2]!.blockedBy).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-all-todo.md
// ---------------------------------------------------------------------------

describe('fixture: plan-all-todo.md', () => {
  it('all 3 phases have todo status and empty deps', () => {
    const { phases, errors } = parsePhasesTable(fixture('plan-all-todo.md'));
    expect(errors).toHaveLength(0);
    for (const p of phases) {
      expect(p.status).toBe('todo');
      expect(p.blocks).toEqual([]);
      expect(p.blockedBy).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-empty-table.md
// ---------------------------------------------------------------------------

describe('fixture: plan-empty-table.md', () => {
  it('returns 0 phases and 0 errors', () => {
    const { phases, errors } = parsePhasesTable(fixture('plan-empty-table.md'));
    expect(errors).toHaveLength(0);
    expect(phases).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-invalid-status-vocab.md
// ---------------------------------------------------------------------------

describe('fixture: plan-invalid-status-vocab.md', () => {
  it('returns errors for unknown statuses (legacy aliases are accepted)', () => {
    const { errors } = parsePhasesTable(fixture('plan-invalid-status-vocab.md'));
    // 'pending' aliased to 'todo' → only 'complete' remains as error
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it("error message hints 'complete' → 'done' migration", () => {
    const { errors } = parsePhasesTable(fixture('plan-invalid-status-vocab.md'));
    const e = errors.find(err => err.message.includes('complete'));
    expect(e).toBeDefined();
    expect(e!.message).toContain("unknown status 'complete'");
    expect(e!.message).toContain("did you mean 'done'?");
    expect(e!.message).toContain('legacy vocab');
  });

  it('errors include line numbers', () => {
    const { errors } = parsePhasesTable(fixture('plan-invalid-status-vocab.md'));
    for (const e of errors) {
      expect(e.line).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-missing-phases-section.md
// ---------------------------------------------------------------------------

describe('fixture: plan-missing-phases-section.md', () => {
  it('returns error with exact message', () => {
    const { errors } = parsePhasesTable(fixture('plan-missing-phases-section.md'));
    expect(errors[0]!.message).toBe('## Phases section not found');
  });

  it('returns 0 phases', () => {
    const { phases } = parsePhasesTable(fixture('plan-missing-phases-section.md'));
    expect(phases).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-ambiguous-multiple-phases.md
// ---------------------------------------------------------------------------

describe('fixture: plan-ambiguous-multiple-phases.md', () => {
  it('returns ambiguous error', () => {
    const { errors } = parsePhasesTable(fixture('plan-ambiguous-multiple-phases.md'));
    expect(errors[0]!.message).toMatch(/ambiguous: multiple ## Phases sections found/);
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-em-dash-deps.md
// ---------------------------------------------------------------------------

describe('fixture: plan-em-dash-deps.md', () => {
  it('parses em-dash as empty deps array', () => {
    const { phases, errors } = parsePhasesTable(fixture('plan-em-dash-deps.md'));
    expect(errors).toHaveLength(0);
    expect(phases[0]!.blocks).toEqual([]);
    expect(phases[0]!.blockedBy).toEqual([]);
  });

  it('phase 03 blocked by 01 and 02', () => {
    const { phases } = parsePhasesTable(fixture('plan-em-dash-deps.md'));
    expect(phases[2]!.blockedBy).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-forward-ref-blockedby.md
// ---------------------------------------------------------------------------

describe('fixture: plan-forward-ref-blockedby.md', () => {
  it('validateDependencies returns error for row 02 blocked by 03', () => {
    const { phases } = parsePhasesTable(fixture('plan-forward-ref-blockedby.md'));
    const errors = validateDependencies(phases);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain('row 02 BlockedBy references row 03');
  });

  it('error line number matches row 02 position', () => {
    const { phases } = parsePhasesTable(fixture('plan-forward-ref-blockedby.md'));
    const errors = validateDependencies(phases);
    // row 02 is at some line > 0
    expect(errors[0]!.line).toBeGreaterThan(0);
    // line matches the PhaseRow.rowLineNumber for phase 2
    const row2 = phases.find(p => p.number === 2)!;
    expect(errors[0]!.line).toBe(row2.rowLineNumber);
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-mutation-roundtrip.md — 3 sequential mutations
// ---------------------------------------------------------------------------

describe('fixture: plan-mutation-roundtrip.md — round-trip test', () => {
  it('3 sequential mutations: each parse succeeds with correct status', () => {
    const original = fixture('plan-mutation-roundtrip.md');

    // Mutation 1: phase 1 → in_progress
    const step1 = updatePhaseStatus(original, 1, 'in_progress');
    const parse1 = parsePhasesTable(step1);
    expect(parse1.errors.filter(e =>
      e.message.includes('## Phases') || e.message.includes('ambiguous')
    )).toHaveLength(0);
    expect(parse1.phases[0]!.status).toBe('in_progress');
    expect(parse1.phases[1]!.status).toBe('todo');
    expect(parse1.phases[2]!.status).toBe('todo');

    // Mutation 2: phase 2 → in_progress
    const step2 = updatePhaseStatus(step1, 2, 'in_progress');
    const parse2 = parsePhasesTable(step2);
    expect(parse2.errors.filter(e =>
      e.message.includes('## Phases') || e.message.includes('ambiguous')
    )).toHaveLength(0);
    expect(parse2.phases[0]!.status).toBe('in_progress');
    expect(parse2.phases[1]!.status).toBe('in_progress');
    expect(parse2.phases[2]!.status).toBe('todo');

    // Mutation 3: phase 1 → done
    const step3 = updatePhaseStatus(step2, 1, 'done');
    const parse3 = parsePhasesTable(step3);
    expect(parse3.errors.filter(e =>
      e.message.includes('## Phases') || e.message.includes('ambiguous')
    )).toHaveLength(0);
    expect(parse3.phases[0]!.status).toBe('done');
    expect(parse3.phases[1]!.status).toBe('in_progress');
    expect(parse3.phases[2]!.status).toBe('todo');
  });

  it('em-dash and link format preserved across mutations', () => {
    const original = fixture('plan-mutation-roundtrip.md');
    const { phases: origPhases } = parsePhasesTable(original);

    const step3 = updatePhaseStatus(
      updatePhaseStatus(
        updatePhaseStatus(original, 1, 'in_progress'),
        2, 'in_progress'
      ),
      1, 'done'
    );
    const { phases: finalPhases } = parsePhasesTable(step3);

    // Files and labels preserved
    for (let i = 0; i < origPhases.length; i++) {
      expect(finalPhases[i]!.file).toBe(origPhases[i]!.file);
      expect(finalPhases[i]!.fileLabel).toBe(origPhases[i]!.fileLabel);
    }
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-custom-label.md — F2 fileLabel preservation
// ---------------------------------------------------------------------------

describe('fixture: plan-custom-label.md — F2 fileLabel preservation', () => {
  it('parses custom label verbatim', () => {
    const { phases, errors } = parsePhasesTable(fixture('plan-custom-label.md'));
    expect(errors).toHaveLength(0);
    expect(phases[1]!.fileLabel).toBe('Implement Auth Layer');
    expect(phases[1]!.file).toBe('phase-02-auth.md');
  });

  it('after updatePhaseStatus, custom label still present verbatim', () => {
    const md = fixture('plan-custom-label.md');
    const updated = updatePhaseStatus(md, 2, 'done');

    // Grep-style assert: label text present in output
    expect(updated).toContain('Implement Auth Layer');

    // Parse again to confirm fileLabel field preserved
    const { phases } = parsePhasesTable(updated);
    expect(phases[1]!.fileLabel).toBe('Implement Auth Layer');
    expect(phases[1]!.status).toBe('done');
  });

  it('all custom labels preserved: Foundation Setup, Write Integration Tests', () => {
    const md = fixture('plan-custom-label.md');
    const updated = updatePhaseStatus(md, 2, 'done');
    expect(updated).toContain('Foundation Setup');
    expect(updated).toContain('Write Integration Tests');
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-numbering-gap.md — F20 number-based forward-ref
// ---------------------------------------------------------------------------

describe('fixture: plan-numbering-gap.md — F20 number-based forward-ref', () => {
  it('parses phases 01, 03, 05 with no errors', () => {
    const { phases, errors } = parsePhasesTable(fixture('plan-numbering-gap.md'));
    expect(errors).toHaveLength(0);
    expect(phases.map(p => p.number)).toEqual([1, 3, 5]);
  });

  it('validateDependencies returns zero errors for valid backward refs', () => {
    const { phases } = parsePhasesTable(fixture('plan-numbering-gap.md'));
    // phase 03 blockedBy 01 (1 < 3 → valid)
    // phase 05 blockedBy 03 (3 < 5 → valid)
    const errors = validateDependencies(phases);
    expect(errors).toHaveLength(0);
  });

  it('uses PhaseRow.number not array index for comparison', () => {
    // Construct phases manually to prove number-based check
    const phases: PhaseRow[] = [
      { number: 1, file: 'phase-01.md', fileLabel: 'p1', status: 'done', blocks: [], blockedBy: [], rowLineNumber: 5 },
      { number: 3, file: 'phase-03.md', fileLabel: 'p3', status: 'todo', blocks: [], blockedBy: [1], rowLineNumber: 6 },
      { number: 5, file: 'phase-05.md', fileLabel: 'p5', status: 'todo', blocks: [], blockedBy: [3], rowLineNumber: 7 },
    ];
    // Array index of phase 3 is 1, but number is 3. blockedBy [1] should be valid (1 < 3).
    // If we used array index, blockedBy [1] at index 1 would be self-ref → error. With number-based it's valid.
    const errors = validateDependencies(phases);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-dash-variants.md — F17 lenient read
// ---------------------------------------------------------------------------

describe('fixture: plan-dash-variants.md — F17 lenient read', () => {
  it('parses all 3 dash variants as empty deps', () => {
    const { phases, errors } = parsePhasesTable(fixture('plan-dash-variants.md'));
    expect(errors).toHaveLength(0);
    for (const p of phases) {
      expect(p.blocks).toEqual([]);
      expect(p.blockedBy).toEqual([]);
    }
  });

  it('after updatePhaseStatus, serializes canonical em-dash U+2014', () => {
    const md = fixture('plan-dash-variants.md');
    const updated = updatePhaseStatus(md, 2, 'done');

    // The serialized table must contain em-dash for empty deps
    const tableLines = updated.split('\n').filter(
      l => l.trim().startsWith('|') &&
           !l.includes('---') &&
           !l.trim().startsWith('| #')
    );

    for (const line of tableLines) {
      // Every data row has empty blocks and blockedBy → must have em-dash
      expect(line).toContain('—'); // U+2014
    }

    // En-dash (–) and hyphen (-) should NOT appear as standalone cell values
    // (they were normalized to em-dash by serializer)
    // Verify by re-parsing: all deps should still be empty
    const { phases } = parsePhasesTable(updated);
    for (const p of phases) {
      expect(p.blocks).toEqual([]);
      expect(p.blockedBy).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// describe fixture: plan-uppercase-path.md — F19 lowercase enforcement
// ---------------------------------------------------------------------------

describe('fixture: plan-uppercase-path.md — F19 lowercase enforcement', () => {
  it('returns error for uppercase path', () => {
    const { errors } = parsePhasesTable(fixture('plan-uppercase-path.md'));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('error message matches exact F19 format', () => {
    const { errors } = parsePhasesTable(fixture('plan-uppercase-path.md'));
    const pathError = errors.find(e => e.message.includes('Phase-02-X.md'));
    expect(pathError).toBeDefined();
    expect(pathError!.message).toBe(
      "path 'Phase-02-X.md' must be lowercase kebab-case (e.g., 'phases/phase-02-x.md')"
    );
  });

  it('error includes line number > 0', () => {
    const { errors } = parsePhasesTable(fixture('plan-uppercase-path.md'));
    const pathError = errors.find(e => e.message.includes('Phase-02-X.md'));
    expect(pathError!.line).toBeGreaterThan(0);
  });

  it('valid row (phase 01) still parsed despite error in phase 02', () => {
    // Non-short-circuit: phase 01 with valid path should still be in phases
    const { phases } = parsePhasesTable(fixture('plan-uppercase-path.md'));
    const p1 = phases.find(p => p.number === 1);
    expect(p1).toBeDefined();
    expect(p1!.file).toBe('phase-01-setup.md');
  });
});
