import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PLAN_SKILL_DIR = resolve(import.meta.dir, '../../../plugins/tdk-core/skills/tdk-plan');

function read(relativePath: string): string {
  return readFileSync(resolve(PLAN_SKILL_DIR, relativePath), 'utf8');
}

describe('tdk-plan parallel safety contract', () => {
  const skill = read('SKILL.md');
  const design = read('references/design-phase.md');
  const output = read('references/plan-output-contract.md');
  const existing = read('references/handle-existing-plan.md');
  const routing = read('references/skill-routing.md');

  it('C-C1 emits canonical safety frontmatter for every generated phase', () => {
    expect(output).toContain('dependencies: []');
    expect(output).toContain('parallel_safe: auto');
    expect(output).toContain('parallel_safe: never');
    expect(output).toContain('parallel_reason: "<concise factual reason>"');
    expect(output).toContain('`auto` MUST omit `parallel_reason`');
    expect(output).toContain('untouched legacy phase files');
    expect(output).toContain('phase_type: spike');
    expect(output).toMatch(/spike\s+always emits `parallel_safe: never`/);
    expect(output).toMatch(
      /dependencies: \[\]\nphase_type: spike\nparallel_safe: never\nparallel_reason:/,
    );
  });

  it('C-C2 defines new, append, and rewrite classification with reciprocal append edges', () => {
    for (const lifecycle of ['New', 'Append', 'Rewrite']) {
      expect(output).toContain(`**${lifecycle}:**`);
    }
    expect(existing).toMatch(/same sorted,\s+unique earlier-phase numbers/);
    expect(existing).toContain("each blocker's `Blocks` cell");
    expect(existing).toContain('`dependencies: []`');
    expect(existing).toContain('`—` in both relation cells');
    expect(existing).toContain('never invent an edge');
    expect(existing).toMatch(/preserve every existing phase file byte-for-byte/i);
  });

  it('C-C2 snapshots every affected path and restores all lifecycle failures', () => {
    expect(output).toContain('transaction snapshot');
    expect(output).toContain('bytes or absence');
    expect(output).toMatch(/remove only files\s+newly created by\s+this invocation/);
    expect(existing).toContain('remove the appended phase file');
    expect(existing).toContain('no orphan phase or table row');
    expect(existing).not.toContain('Keep `phases/phase-${NN}-${slug}.md`');
  });

  it('C-C3 uses the complete access predicate and exact Related Code Files grammar', () => {
    expect(output).toContain('- (Read|Modify|Create|Delete): `<path>`');
    expect(output).toContain('exactly one `## Related Code Files` section');
    expect(output).toContain('at least one validated write');
    expect(output).toContain('own canonical write targets');
    expect(output).toContain('complete project-file read set');
    expect(output).toContain('future planned phase will create');
    expect(output).toContain('`parallel_safe: never`');
  });

  it('C-C3 freezes every plan-shape classification without changing test-mode order', () => {
    for (const shape of ['Normal (`test_mode: none`)', 'TDD', 'UT backfill', 'Spike', 'Monolith', 'Multi-subworkspace']) {
      expect(design).toContain(`| ${shape} |`);
    }
    expect(design).toContain('Preserve tests-first and delegate order');
    expect(design).toContain('Preserve delegate order');
    expect(output).toContain('## Tests Before` → `## Refactor / Implementation` → `## Tests After`');
    expect(output).toContain('`## Delegate Skills` remains after `## Test Quality Gate`');
  });

  it('C-C3 separates bounded worker commands from broad controller gates', () => {
    expect(design).toContain('Command–Query Separation');
    expect(design).toContain('worker-side command');
    expect(design).toMatch(/unknown, broad, shared, generated, ignored, or undeclared/i);
    expect(design).toContain('after all workers join and the first audit passes');
    expect(design).toContain('final audit');
    expect(design).toContain('no new Git-visible or protected delta');
  });

  it('C-C3 maximizes real DAG width but keeps integration work together', () => {
    expect(design).toMatch(/maximize real DAG width/i);
    expect(design).toContain('exactly one configured sub-workspace');
    expect(design).toContain('spans multiple configured sub-workspaces');
    expect(design).toContain('one integration worker');
    expect(design).toContain('Inter-phase access overlap does not change classification');
  });

  it('C-C4 runs the frozen validation sequence before guardian and reporting', () => {
    const commands = [
      'plan-prose-validator.ts "$FEATURE_DIR/plan.md" --json',
      'plan-status-validator.ts "$FEATURE_DIR/plan.md" --json',
      'validate-phase-file.ts "$PHASE_PATH" --phase-number "$PHASE_NUMBER" --plan "$FEATURE_DIR/plan.md" --mode parallel --project-root "$PROJECT_DIR" --json',
      'resolve-parallel-phase-wave.ts --project-root "$PROJECT_DIR" --plan "$FEATURE_DIR/plan.md" --validate-only',
    ];
    let previous = -1;
    for (const command of commands) {
      const index = output.indexOf(command);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
    expect(skill).toContain('before `Phase 0.guardian` and Step 4 reporting');
    expect(output).toContain('No validator-triggered repair or downgrade');
    expect(output).toContain('malformed JSON');
  });

  it('C-C5 acquires the shared mutation reservation before every planner write', () => {
    expect(skill).toContain('parallel-controller.ts reserve --project-root "$PROJECT_DIR"');
    expect(skill).toContain('Before skill-routing creation, scope/dependency fixes, migration, setup, red-team');
    expect(output).toContain('Exit `0` proceeds');
    expect(output).toContain('Exit `2`');
    expect(output).toContain('controllerId');
    expect(output).toContain('Git worktree is required');
    expect(output).toContain('Never wait, steal, or age it out');
    expect(output).toContain('Release a pre-mutation');
    expect(output).toContain('snapshot-plan');
    expect(output).toContain('finalize-plan');
    expect(output).toContain('recover-plan --old-controller-id');
  });

  it('preserves the five-column table and capability-only routing boundary', () => {
    expect(output).toContain('| # | File | Status | Blocks | BlockedBy |');
    expect(output).not.toMatch(/\|\s*Parallel(?: Safe)?\s*\|/i);
    expect(routing).toContain('Domains are freeform strings');
    expect(routing).not.toContain('parallel-safe');
    expect(routing).not.toContain('schedulability');
    expect(design).toMatch(/routing selects capability; it never\s+decides schedulability/);
  });
});
