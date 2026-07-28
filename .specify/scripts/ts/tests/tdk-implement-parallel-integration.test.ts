import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkPhaseWriteDisjointness } from '../src/commands/util/check-phase-write-disjointness';
import {
  inspectParallelPhaseStatuses,
  transitionParallelPhaseStatuses,
} from '../src/commands/util/parallel-phase-status-reconciler';
import { parsePhasesTable } from '../src/commands/util/phases-table-parser';

// End-to-end of the prompt-driven contract in `parallel-phase-orchestration.md`:
// candidate set -> one checker call -> workers -> status writes. No lease, no
// resolver, no strict worker result schema — a worker "report" here is just the
// file bytes it wrote plus the pass/fail decision the main agent makes from prose.

const PLAN = `## Phases

| # | File | Status | Blocks | BlockedBy |
|---|------|--------|--------|-----------|
| 01 | [A](phases/phase-01-a.md) | todo | — | — |
| 02 | [B](phases/phase-02-b.md) | todo | — | — |
`;

const phaseFile = (phase: number, modify: string): string =>
  `---\nphase: ${phase}\nstatus: todo\nparallel_safe: auto\nparallel_reason: "declared write sets are disjoint"\n---\n\n`
  + `# Phase ${phase}\n\n## Related Code Files\n\n- Modify: \`${modify}\`\n`;

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function repository(modifyA = 'src/a.ts', modifyB = 'src/b.ts') {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-parallel-integration-')));
  roots.push(root);
  mkdirSync(join(root, 'phases')); mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'plan.md'), PLAN);
  writeFileSync(join(root, 'src/a.ts'), 'a1\n'); writeFileSync(join(root, 'src/b.ts'), 'b1\n');
  writeFileSync(join(root, 'phases/phase-01-a.md'), phaseFile(1, modifyA));
  writeFileSync(join(root, 'phases/phase-02-b.md'), phaseFile(2, modifyB));
  spawnSync('git', ['init', '-q'], { cwd: root }); spawnSync('git', ['add', '.'], { cwd: root });
  spawnSync('git', ['-c', 'user.name=TDK', '-c', 'user.email=tdk@example.invalid', 'commit', '-qm', 'base'], { cwd: root });
  return { projectRoot: root, planPath: join(root, 'plan.md'), featureDir: root };
}

/** What the main agent builds from each candidate's `## Related Code Files` bullets. */
const accessSets = (modifyA: string, modifyB: string) => [
  { phase: 1, read: [], modify: [modifyA], create: [], delete: [] },
  { phase: 2, read: [], modify: [modifyB], create: [], delete: [] },
];

const planStatuses = (input: ReturnType<typeof repository>): string[] =>
  inspectParallelPhaseStatuses(input.projectRoot, input.planPath, input.featureDir).rows.map((row) => row.planStatus);

describe('tdk-implement parallel orchestration integration', () => {
  it('takes a disjoint candidate pair from the checker through workers to one completion batch', () => {
    const input = repository();
    const parsed = parsePhasesTable(readFileSync(input.planPath, 'utf8'));
    expect(parsed.errors).toEqual([]);
    expect(parsed.phases.map((row) => row.status)).toEqual(['todo', 'todo']);
    expect(readFileSync(join(input.projectRoot, 'phases/phase-01-a.md'), 'utf8')).toContain('parallel_safe: auto');

    const decision = checkPhaseWriteDisjointness(accessSets('src/a.ts', 'src/b.ts'), input.projectRoot, 'schedule');
    expect(decision).toEqual({ safe: [1, 2], conflicts: [], rejected: [] });

    for (const phase of decision.safe) {
      transitionParallelPhaseStatuses({ ...input, transitions: [{ phase, from: 'todo', to: 'in_progress' }] });
    }
    expect(planStatuses(input)).toEqual(['in_progress', 'in_progress']);

    writeFileSync(join(input.projectRoot, 'src/a.ts'), 'a2\n');
    writeFileSync(join(input.projectRoot, 'src/b.ts'), 'b2\n');

    transitionParallelPhaseStatuses({ ...input, waveId: 'wave-1', transitions: [
      { phase: 1, from: 'in_progress', to: 'done' }, { phase: 2, from: 'in_progress', to: 'done' },
    ] });
    const final = inspectParallelPhaseStatuses(input.projectRoot, input.planPath, input.featureDir);
    expect(final.rows.map((row) => row.planStatus)).toEqual(['done', 'done']);
    expect(final.rows.map((row) => row.frontmatterStatus)).toEqual(['done', 'done']);
    expect(final.mismatches).toEqual([]);
  });

  it('keeps an overlapping candidate pair out of the wave and completes it one phase at a time', () => {
    const input = repository('src/a.ts', 'src/a.ts');
    const decision = checkPhaseWriteDisjointness(accessSets('src/a.ts', 'src/a.ts'), input.projectRoot, 'schedule');
    expect(decision.safe).toEqual([]);
    expect(decision.conflicts).toEqual([{ a: 1, b: 2, paths: ['src/a.ts'] }]);
    expect(decision.rejected).toEqual([]);

    for (const phase of [1, 2]) {
      transitionParallelPhaseStatuses({ ...input, transitions: [{ phase, from: 'todo', to: 'in_progress' }] });
      writeFileSync(join(input.projectRoot, 'src/a.ts'), `a${phase + 1}\n`);
      transitionParallelPhaseStatuses({ ...input, transitions: [{ phase, from: 'in_progress', to: 'done' }] });
    }
    expect(planStatuses(input)).toEqual(['done', 'done']);
  });

  it('marks no sibling done when one worker report is not a completion, and bounds the completion batch', () => {
    const input = repository();
    for (const phase of [1, 2]) {
      transitionParallelPhaseStatuses({ ...input, transitions: [{ phase, from: 'todo', to: 'in_progress' }] });
    }
    expect(() => transitionParallelPhaseStatuses({ ...input, waveId: 'wave-1', transitions: [
      { phase: 1, from: 'in_progress', to: 'done' }, { phase: 2, from: 'in_progress', to: 'blocked' },
    ] })).toThrow('wave transition requires in_progress to done for every phase');
    expect(planStatuses(input)).toEqual(['in_progress', 'in_progress']);
    expect(readFileSync(input.planPath, 'utf8')).not.toContain('| done |');

    expect(() => transitionParallelPhaseStatuses({ ...input, waveId: 'wave-1', transitions: [1, 2, 3, 4, 5]
      .map((phase) => ({ phase, from: 'in_progress' as const, to: 'done' as const })) }))
      .toThrow('wave transition requires one to four phases');
  });

  it('leaves a policy-rejected phase out of the wave while its sibling still runs', () => {
    const input = repository();
    writeFileSync(join(input.projectRoot, 'CLAUDE.md'), '# guidance\n');
    const decision = checkPhaseWriteDisjointness(
      [{ phase: 1, read: [], modify: ['CLAUDE.md'], create: [], delete: [] }, ...accessSets('src/a.ts', 'src/b.ts').slice(1)],
      input.projectRoot, 'schedule',
    );
    expect(decision.safe).toEqual([2]);
    expect(decision.conflicts).toEqual([]);
    expect(decision.rejected.map((item) => item.code)).toContain('DENIED_WRITE_PATH');
  });
});
