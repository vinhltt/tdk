import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CORE = resolve(import.meta.dir, '../../../plugins/tdk-core/skills');
const read = (path: string): string => readFileSync(resolve(CORE, path), 'utf-8');

const GATE_COMMAND = 'bun src/commands/util/validate-specification-quality-gate.ts';
const RECONCILE_COMMAND =
  '(cd "$PROJECT_DIR/.specify/scripts/ts" && bun src/commands/util/update-phase-status.ts --reconcile-root "$FEATURE_DIR/plan.md")';

// Pre-plan spec status is prompt-owned and follows the same gate verdict tdk-plan
// accepts, so `ready` always means plannable. Post-plan values are script-derived.
describe('pre-plan spec lifecycle transitions', () => {
  it('tdk-specify sets draft/ready from the gate verdict with the legacy checklist fallback', () => {
    const workflow = read('tdk-specify/references/spec-generation-and-validation-workflow.md');
    expect(workflow).toContain(`${GATE_COMMAND} "{SPEC_FILE}" --legacy-checklist "{FEATURE_DIR}/checklists/requirements.md" --json`);
    expect(workflow).toContain('`allowed: true` → `ready`, otherwise `draft`');
    expect(workflow).toContain('is `draft` or `ready` (legacy `Draft` included)');
    expect(read('tdk-specify/SKILL.md')).toContain('Then set the spec frontmatter `status:` to `ready`');
  });

  it('tdk-clarify keeps planned-or-later status and warns on a failing gate', () => {
    const clarify = read('tdk-clarify/SKILL.md');
    expect(clarify).toContain(`${GATE_COMMAND} "{FEATURE_SPEC}" --legacy-checklist "{FEATURE_DIR}/checklists/requirements.md" --json`);
    expect(clarify).toContain('`planned` or later: keep the value');
    expect(clarify).toContain('spec status stays `<status>` because a plan exists');
  });

  it('tdk-plan step 0.9 still uses the same gate command', () => {
    expect(read('tdk-plan/SKILL.md')).toContain(`${GATE_COMMAND} "{featureSpec}" --legacy-checklist "{featureDir}/checklists/requirements.md" --json`);
  });
});

describe('tdk-plan generation keeps plan root and spec status in sync', () => {
  it('writes new plans at planned with the lifecycle vocabulary', () => {
    const contract = read('tdk-plan/references/plan-output-contract.md');
    expect(contract).toContain('status: planned           # draft | ready | planned | in_progress | blocked | done | cancelled | archived');
    expect(contract).toContain('a legacy root `todo` reads as `planned`');
    expect(contract).toContain('Manual\nroot edits are overwritten by the next status write');
  });

  it('runs one root reconcile after status finalization, before the post-write gates', () => {
    const routing = read('tdk-plan/references/delegate-routing-injection.md');
    const finalize = routing.indexOf('5. After injection');
    const reconcile = routing.indexOf(RECONCILE_COMMAND);
    const gates = routing.indexOf('6. Re-read the finalized selected phase files');
    expect(finalize).toBeGreaterThan(-1);
    expect(reconcile).toBeGreaterThan(finalize);
    expect(gates).toBeGreaterThan(reconcile);
    expect(routing).toContain('A non-zero exit uses the same rollback, including `spec.md`.');
  });

  it('includes spec.md in the generation snapshot and rollback set', () => {
    expect(read('tdk-plan/SKILL.md')).toContain('`plan.md`, sibling `spec.md` (generation finalize rewrites its lifecycle `status`)');
    const existing = read('tdk-plan/references/handle-existing-plan.md');
    expect(existing).toContain('pre-mutation byte snapshots contain the prior `plan.md`, `spec.md`');
    expect(existing).toContain('Retain the pre-mutation `plan.md` and `spec.md` byte snapshots');
    expect(existing).toContain('restores prior `spec.md` bytes');
    expect(read('tdk-plan/references/delegate-routing-injection.md')).toContain('restores previous `spec.md` bytes');
  });

  it('runs the reconcile on the append flow', () => {
    expect(read('tdk-plan/references/handle-existing-plan.md'))
      .toContain('then run `--reconcile-root` once per `delegate-routing-injection.md` step 5');
    expect(read('tdk-plan/references/design-phase.md')).toContain('run the single `--reconcile-root`');
  });
});
