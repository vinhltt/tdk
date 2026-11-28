import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Lifecycle skills print the /tdk-status ladder answer as their last line instead of a hard-coded step.
// Tokens only (paths, field names, ids), not prose, so rewording a sentence does not break the contract.

const PLUGINS = resolve(import.meta.dir, '../../../plugins');
const IMPLEMENT = join(PLUGINS, 'tdk-core/skills/tdk-implement');
const REVIEW = join(PLUGINS, 'tdk-core/skills/tdk-review');
const ARCHIVE = join(PLUGINS, 'tdk-core/skills/tdk-archive');
const RETRO_APPLY = join(PLUGINS, 'tdk-retro/skills/tdk-retro-apply');

const read = (...parts: string[]): string => readFileSync(join(...parts), 'utf-8');

/** Text between two markers; fails loudly when a marker is missing so a renamed heading cannot hide a regression. */
function between(text: string, start: string, end?: string): string {
  const from = text.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = end === undefined ? text.length : text.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return text.slice(from, to);
}

const COLLECTOR = 'src/commands/feature/status.ts';
const FIELDS = ['recommendation.primary', 'recommendation.alternative'];

/** A `status.ts` call on the task id (any case): a canonical `<folder>/<ticket>` id never falls back to the archive, so archived specs are queried as `archive/<id>`. */
const CANONICAL_ID_CALL = /status\.ts\s+"?\{task_id\}/i;

/** The collector call, both ladder fields and the exact `Next:` fallback line must all be present. */
function expectCollectorContract(name: string, slice: string, fallback: string): void {
  const missing = [COLLECTOR, ...FIELDS, fallback].filter((token) => !slice.includes(token));
  expect({ name, missing }).toEqual({ name, missing: [] });
}

describe('tdk-implement next step', () => {
  const skill = read(IMPLEMENT, 'SKILL.md');
  const phaseExecution = read(IMPLEMENT, 'references/phase-execution.md');
  const parallel = read(IMPLEMENT, 'references/parallel-phase-orchestration.md');
  const step8 = between(skill, '### Step 8', '## Required Reference Load Contract');
  const completion = between(phaseExecution, '## Completion Summary');
  const nextStep = between(phaseExecution, '### Next step');
  const finalStop = between(parallel, 'Stop when no candidate remains.', '## Worker Boundary');

  it('every way an implement run ends points at the status collector and ladder fields', () => {
    expect(step8).toContain('Completion Summary');
    expectCollectorContract('phase-execution completion', completion, 'Next: /tdk-status {task_id}');
    expectCollectorContract('parallel final stop', finalStop, '/tdk-status {task_id}');
    expect(step8).toContain(COLLECTOR);
    expect(step8).toContain('recommendation.primary');
    expect(step8).toContain('/tdk-status');
    expect(parallel.slice(parallel.indexOf('Stop when no candidate remains.'))).toContain('phase-execution.md');
  });

  it('runs the collector last, after the phase status writes, on the active task id', () => {
    expect(nextStep).toContain('**last**');
    expect(nextStep).toContain('after every phase status write');
    expect(nextStep).toMatch(/status\.ts \{TASK_ID\}/);
    expect(completion.indexOf('Phases executed')).toBeLessThan(completion.indexOf(COLLECTOR));
    expect(finalStop).toContain('after the last wave');
  });

  it('never hard-codes a lifecycle step after implement', () => {
    for (const [name, slice] of [['SKILL.md step 8', step8], ['phase-execution completion', completion], ['parallel final stop', finalStop]] as const) {
      const hardCoded = ['/tdk-archive', '/tdk-review', '--ingest'].filter((token) => slice.includes(token));
      expect({ name, hardCoded }).toEqual({ name, hardCoded: [] });
    }
  });
});

describe('tdk-review next step', () => {
  const skill = read(REVIEW, 'SKILL.md');
  const step5 = between(skill, '## Step 5', '## Bundled helpers');

  it('prints the ladder next step with the status fallback', () => {
    expectCollectorContract('tdk-review step 5', step5, 'Next: /tdk-status {TASK_ID}');
    expect(step5).toMatch(/status\.ts \{TASK_ID\}/);
  });

  it('runs the collector after the report is written and after the seed lines', () => {
    expect(skill.indexOf('## Step 4')).toBeGreaterThan(0);
    expect(skill.indexOf('## Step 4')).toBeLessThan(skill.indexOf('## Step 5'));
    expect(step5).toContain('**after** the Step 4 report write');
    expect(step5.indexOf('/tdk-plan <id>')).toBeGreaterThanOrEqual(0);
    expect(step5.indexOf('/tdk-plan <id>')).toBeLessThan(step5.indexOf(COLLECTOR));
  });

  it('does not hard-code a lifecycle step', () => {
    expect(step5).not.toContain('/tdk-archive');
    expect(step5).not.toContain('--ingest');
  });
});

describe('tdk-archive next step', () => {
  const skill = read(ARCHIVE, 'SKILL.md');
  const references = readdirSync(join(ARCHIVE, 'references'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => read(ARCHIVE, 'references', file));
  const ingest = read(ARCHIVE, 'references/ingest-workflow.md');
  const next = between(skill, '## Next step', '## Restore');
  const resolveStep = between(skill, 'Resolve before loading any context', 'tdk-load-project-context');
  const report = between(skill, '## Step 6', '## Ingest');
  const frontmatter = between(skill, '---', '\n---');

  it('queries the archived spec as archive/<canonical id> through the collector, last', () => {
    expect(next).toContain('STATUS_ID="archive/{TASK_ID}"');
    expect(next).toContain('"$STATUS_ID"');
    expect(next).toContain('**last**');
    expectCollectorContract('tdk-archive next step', next, 'Next: /tdk-status archive/');
    // A canonical-id call on an archived spec fails to resolve: never appears anywhere in the skill.
    for (const text of [skill, ...references]) expect(text).not.toMatch(CANONICAL_ID_CALL);
  });

  it('prints the next step at every way an archive run ends', () => {
    expect(resolveStep).toContain('`archived: true`');
    expect(resolveStep).toContain('STOP');
    expect(resolveStep).toContain('[Next step](#next-step)');
    expect(resolveStep).toContain('archive/<taskId>');
    // Git lines first, next step after them.
    expect(report.indexOf('git commit')).toBeGreaterThan(0);
    expect(report.indexOf('git commit')).toBeLessThan(report.indexOf('[Next step](#next-step)'));
    expect(report).toContain('--auto-upmem');
    expect(report).toContain('[Ingest](#ingest)');
    expect(between(skill, '## Ingest', '## Next step')).toContain('[Next step](#next-step)');
    const ingestEnd = between(ingest, '## 6. Recompute and report', '## Crash safety');
    expect(ingestEnd).toContain('SKILL.md [Next step]');
    expect(ingestEnd).toContain('archive/<canonical task id>');
    expect(ingestEnd.indexOf('memory_status')).toBeLessThan(ingestEnd.indexOf('Next step'));
    // The early stop of a missing memory preflight ends the run too: it still prints the next step.
    expect(between(ingest, '## 2. Memory preflight', '## 3.')).toContain('[Next step](../SKILL.md#next-step)');
    // After archived resolution the id is the JSON taskId, never the raw argument.
    expect(between(ingest, '## 1. Scope', '## 2.')).toContain('JSON `taskId`');
  });

  it('no longer prints --ingest as the post-archive hint', () => {
    for (const text of [skill, ...references]) expect(text).not.toContain('print `/tdk-archive --ingest');
    expect(frontmatter).not.toContain('suggests /tdk-archive --ingest');
    expect(report).not.toContain('/tdk-archive --ingest');
    expect(resolveStep).not.toContain('/tdk-archive --ingest');
    expect(next).not.toContain('print `--ingest');
  });
});

describe('tdk-retro-apply next step', () => {
  const skill = read(RETRO_APPLY, 'SKILL.md');
  const step7 = between(skill, '## Step 7');

  it('prints the ladder next step for the spec, archived or not, last', () => {
    expectCollectorContract('tdk-retro-apply step 7', step7, 'Next: /tdk-status $STATUS_ID');
    expect(step7).toContain('STATUS_ID="{TASK_ID}"');
    expect(step7).toContain('STATUS_ID="archive/{TASK_ID}"');
    expect(step7).toContain('status.ts "$STATUS_ID"');
    expect(step7).toContain('**last**');
    expect(step7).toContain('/tdk-status $STATUS_ID');
    expect(step7.indexOf('Suggested commit message')).toBeLessThan(step7.indexOf(COLLECTOR));
  });

  it('does not hard-code a lifecycle step', () => {
    expect(step7).not.toContain('/tdk-archive');
    expect(step7).not.toContain('--ingest');
    expect(step7).not.toMatch(CANONICAL_ID_CALL);
  });
});

// Inception skills run before the spec lifecycle, so they have no status collector to defer to.
// Their contract is the route token itself: after config, point at the sub-workspace bootstrap, and keep
// the docs-only command as the fallback for projects without the optional tdk-scaffold plugin.
describe('inception routes point at the sub-workspace bootstrap', () => {
  const INCEPTION = join(PLUGINS, 'tdk-inception/skills');
  const BOOTSTRAP = 'sub-workspace-bootstrap';
  const DOCS_ALL = 'sub-workspace-docs --all';

  /** The docs-only command may appear only as the fallback, after `without` on its own line. */
  function expectBootstrapWithFallback(slice: string): void {
    expect(slice).toContain(BOOTSTRAP);
    expect(slice).toContain('without');
    for (const line of slice.split('\n').filter((l) => l.includes(DOCS_ALL))) {
      const without = line.indexOf('without');
      expect(without).toBeGreaterThanOrEqual(0);
      expect(line.indexOf(DOCS_ALL)).toBeGreaterThan(without);
    }
  }

  it('config-apply reports the bootstrap with the docs fallback after a successful apply', () => {
    const skill = read(INCEPTION, 'tdk-workflow-config-apply/SKILL.md');
    const report = between(skill, '### Step 6 - Report', '## Quality Gates');
    expect(report).toContain('/tdk-sub-workspace-bootstrap');
    expect(report).toContain('without tdk-scaffold');
    expectBootstrapWithFallback(report);
  });

  it('brownfield start recommends the bootstrap in its route chain and rules', () => {
    const skill = read(INCEPTION, 'tdk-brownfield-start/SKILL.md');
    expectBootstrapWithFallback(between(skill, '7. **Return recommended next routes.**', '## Mode Behavior'));
    expectBootstrapWithFallback(between(skill, '## Recommendation Rules', '## Failure Modes'));
  });

  it('brownfield and architecture recovery references recommend the bootstrap', () => {
    for (const path of [
      'tdk-brownfield-start/references/workflow-full.md',
      'tdk-architecture-advisor/references/workflow-recover-existing.md',
    ]) {
      const text = read(INCEPTION, path);
      expect(text).toContain(BOOTSTRAP);
      expectBootstrapWithFallback(between(text, '## Route Rules', '## Stop Conditions'));
    }
  });
});

// The one-command entry runs the whole inception lane, so both start skills offer it first.
describe('start skills offer the one-command project bootstrap', () => {
  const INCEPTION = join(PLUGINS, 'tdk-inception/skills');
  const ENTRY = '/tdk-project-bootstrap';

  it('brownfield start lists the entry, with layout between recovery and config apply', () => {
    const skill = read(INCEPTION, 'tdk-brownfield-start/SKILL.md');
    const chain = between(skill, '7. **Return recommended next routes.**', '## Mode Behavior');
    expect(chain).toContain(ENTRY);
    const layout = chain.indexOf('/tdk-workspace-layout-propose --from-existing');
    expect(layout).toBeGreaterThan(chain.indexOf('/tdk-architecture-advisor --recover-existing'));
    expect(layout).toBeLessThan(chain.indexOf('/tdk-workflow-config-apply'));
    expect(between(skill, '## Recommendation Rules', '## Failure Modes')).toContain(ENTRY);
  });

  it('both start workflows and the greenfield route examples offer the entry', () => {
    for (const path of [
      'tdk-brownfield-start/references/workflow-full.md',
      'tdk-greenfield-start/references/workflow-full.md',
    ]) {
      expect(between(read(INCEPTION, path), '## Route Rules', '## Stop Conditions')).toContain(ENTRY);
    }
    const greenfield = read(INCEPTION, 'tdk-greenfield-start/SKILL.md');
    expect(between(greenfield, 'Common route examples:', '### Step 8')).toContain(ENTRY);
  });
});
