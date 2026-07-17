import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CORE = resolve(import.meta.dir, '../../../plugins/tdk-core/skills');
const SPECIFY = resolve(CORE, 'tdk-specify/SKILL.md');
const SPECIFY_WORKFLOW = resolve(CORE, 'tdk-specify/references/spec-generation-and-validation-workflow.md');
const QUALITY_GUIDELINES = resolve(CORE, 'tdk-specify/references/spec-quality-guidelines.md');
const CLARIFY = resolve(CORE, 'tdk-clarify/SKILL.md');
const PLAN = resolve(CORE, 'tdk-plan/SKILL.md');
const SPEC_TEMPLATE = resolve(import.meta.dir, '../../../templates/spec-template.md.tpl');

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('specification quality gate skill contract', () => {
  it('makes tdk-specify the embedded gate writer without new checklist files', () => {
    const skill = read(SPECIFY);
    const workflow = read(SPECIFY_WORKFLOW);

    expect(skill).toContain('`## Specification Quality Gate`');
    expect(skill).not.toContain('Create `FEATURE_DIR/checklists/requirements.md`');
    expect(workflow).toContain('Set');
    expect(workflow).toContain('`Source` to `tdk-specify`');
    expect(workflow).toContain('do not create');
    expect(workflow).toContain('`checklists/requirements.md` for a');
    expect(workflow).toContain('new spec.');
  });

  it('defines the gate schema and legacy fallback centrally', () => {
    const guidelines = read(QUALITY_GUIDELINES);
    const template = read(SPEC_TEMPLATE);

    for (const field of ['Status', 'Iterations', 'Source', 'Last Checked', '### Blocking Issues']) {
      expect(guidelines).toContain(field);
      expect(template).toContain(field);
    }
    expect(guidelines).toContain('read-only fallback');
  });

  it('requires tdk-clarify to rerun and rewrite the gate', () => {
    const clarify = read(CLARIFY);

    expect(clarify).toContain('Re-run the specification-quality dimensions');
    expect(clarify).toContain('set `Source` to');
    expect(clarify).toContain('`tdk-clarify`');
    expect(clarify).toContain('Do not rewrite or delete an existing `checklists/requirements.md`');
  });

  it('blocks planning through the deterministic validator while allowing legacy fallback', () => {
    const plan = read(PLAN);

    expect(plan).toContain('### Step 0.9 — Specification Quality Gate Preflight');
    expect(plan).toContain('validate-specification-quality-gate.ts');
    expect(plan).toContain('--legacy-checklist');
    expect(plan).toContain('STOP on');
    expect(plan.indexOf('Step 0.9 — Specification Quality Gate Preflight')).toBeLessThan(
      plan.indexOf('Step 1 — Setup'),
    );
    expect(plan).toContain('X --> Q[Step 0.9 Specification Quality Gate]');
    expect(plan).toContain('Q --> D[Step 1 Setup]');
  });
});
