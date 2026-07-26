import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildPhaseScheduleInputs } from '../src/commands/util/resolve-parallel-phase-wave-input-builder';
import { resolveParallelPhaseWave } from '../src/commands/util/parallel-phase-wave-resolver';
import type { PhaseRow } from '../src/commands/util/phases-table-parser';

let root: string;
let planPath: string;

function writeFile(relPath: string, contents: string): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

function readyRow(number: number, file: string): PhaseRow {
  return { number, file, fileLabel: file, status: 'todo', blocks: [], blockedBy: [], rowLineNumber: number };
}

function codes(diagnostics: { code: string }[]): string[] {
  return diagnostics.map((d) => d.code);
}

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-input-builder-')));
  planPath = join(root, 'plan.md');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('buildPhaseScheduleInputs — Finding D (malformed frontmatter must not launder into legacy)', () => {
  it('an unparsable frontmatter block that declares parallel_safe: auto reports PHASE_FRONTMATTER_UNPARSABLE, not a legacy barrier', () => {
    // Broken YAML (unterminated flow sequence) alongside a genuine `parallel_safe: auto` declaration —
    // this must never be indistinguishable from a phase that simply omits parallel_safe.
    writeFile(
      'phases/phase-01-one.md',
      ['---', 'parallel_safe: auto', 'bad_key: [unterminated', '---', '', '# Phase One', ''].join('\n'),
    );

    const { inputs, errors } = buildPhaseScheduleInputs([readyRow(1, 'phases/phase-01-one.md')], planPath, root);

    expect(codes(errors)).toContain('PHASE_FRONTMATTER_UNPARSABLE');
    expect(codes(errors)).not.toContain('PARALLEL_SAFETY_ERROR');
    expect(inputs[0]!.parallelSafe).not.toBe('auto');
    expect(inputs[0]!.parallelSafe).toBe('never');

    // Feeding the row straight into the pure resolver must not produce the
    // misleading "no parallel_safe metadata" warning a genuinely legacy
    // phase gets — the file DOES declare parallel_safe, it just failed to parse.
    const resolved = resolveParallelPhaseWave(inputs);
    expect(resolved.state).toBe('serial-barrier');
    expect(codes(resolved.warnings)).not.toContain('LEGACY_SERIAL_BARRIER');
  });
});

describe('buildPhaseScheduleInputs — Finding F (incomplete access set must not be schedulable as auto)', () => {
  it('an auto phase with one unresolvable write is not returned as auto, and its access set is not truncated-but-usable', () => {
    writeFile('src/good.ts', 'export const ok = true;\n');
    writeFile(
      'phases/phase-01-one.md',
      [
        '---',
        'parallel_safe: auto',
        '---',
        '',
        '# Phase One',
        '',
        '## Related Code Files',
        '',
        '- Modify: `src/good.ts`',
        '- Modify: `src/missing.ts`',
        '',
      ].join('\n'),
    );

    const { inputs, errors } = buildPhaseScheduleInputs([readyRow(1, 'phases/phase-01-one.md')], planPath, root);

    expect(codes(errors)).toContain('ACCESS_TARGET_NOT_FOUND');
    expect(inputs[0]!.parallelSafe).not.toBe('auto');
    expect(inputs[0]!.access.writes).toEqual([]);
    expect(inputs[0]!.access.reads).toEqual([]);

    const resolved = resolveParallelPhaseWave(inputs);
    expect(codes(resolved.warnings)).not.toContain('LEGACY_SERIAL_BARRIER');
  });
});
