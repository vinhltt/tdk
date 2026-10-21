import { afterAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  deriveFeatureLifecycleStatus, readStoredStatuses, statusMismatchWarnings,
} from '../src/commands/feature/feature-lifecycle-status';
import { parsePhasesTable } from '../src/commands/util/phases-table-parser';
import { derivePlanRootStatus } from '../src/commands/util/plan-root-status';
import { makeRepo } from './fixtures/polyrepo';

const STATUS_SOURCE = resolve(import.meta.dir, '../src/commands/feature/status.ts');
const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const GATE_PASS = [
  '## Specification Quality Gate', '',
  '| Field | Value |', '|---|---|',
  '| Status | pass |', '| Iterations | 1 |', '| Source | tdk-specify |', '| Last Checked | 2026-10-20 |', '',
  '### Blocking Issues', '', 'None.', '',
].join('\n');

const GATE_FAIL = GATE_PASS.replace('| Status | pass |', '| Status | fail |');

function spec(status: string | null, body = GATE_PASS): string {
  const frontmatter = status === null ? '' : `---\nstatus: ${status}\n---\n\n`;
  return `${frontmatter}# Sample feature\n\n${body}`;
}

function plan(rowStatuses: string[], rootStatus: string | null = 'planned'): string {
  const frontmatter = rootStatus === null ? '' : `---\nstatus: ${rootStatus}\n---\n\n`;
  const rows = rowStatuses.map((status, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `| ${n} | [phase-${n}-sample](phase-${n}-sample.md) | ${status} | — | — |`;
  });
  return [
    `${frontmatter}# Plan`, '', '## Phases', '',
    '| # | File | Status | Blocks | BlockedBy |', '|---|---|---|---|---|', ...rows, '',
  ].join('\n');
}

function makeWorkspace(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-lifecycle-')));
  roots.push(root);
  makeRepo(root, 'main');
  mkdirSync(join(root, '.specify'), { recursive: true });
  writeFileSync(join(root, '.specify/.specify.json'), JSON.stringify({ name: 'sample-workspace' }));
  return root;
}

/** Write feature files under `<root>/<relDir>`; `null` skips that file. */
function writeFeature(root: string, relDir: string, files: Record<string, string>): string {
  const dir = join(root, relDir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

function runStatus(root: string, ...args: string[]): Record<string, any> {
  const stdout = execFileSync('bun', [STATUS_SOURCE, ...args], {
    cwd: root,
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return JSON.parse(stdout);
}

describe('deriveFeatureLifecycleStatus', () => {
  const root = makeWorkspace();
  const derive = (files: Record<string, string>) => {
    const dir = writeFeature(root, `.specify/feature/case-${Math.random().toString(36).slice(2)}`, files);
    const planMd = files['plan.md'] ?? null;
    const parsed = planMd === null ? null : parsePhasesTable(planMd);
    return deriveFeatureLifecycleStatus({
      featureDir: dir,
      specMd: files['spec.md'] ?? null,
      planMd,
      phases: parsed?.phases ?? [],
      phasesParseOk: parsed !== null && parsed.errors.length === 0,
    });
  };

  it('reports empty when there is no spec', () => {
    expect(derive({}).status).toBe('empty');
  });

  it('reports ready for a spec-only feature whose gate passes, whatever the stored status says', () => {
    expect(derive({ 'spec.md': spec('Draft') }).status).toBe('ready');
  });

  it('reports draft when the gate fails or the gate block is missing', () => {
    expect(derive({ 'spec.md': spec('ready', GATE_FAIL) }).status).toBe('draft');
    expect(derive({ 'spec.md': spec('ready', 'No gate here.\n') }).status).toBe('draft');
  });

  it('accepts the legacy requirements checklist when the gate block is missing', () => {
    const withChecklist = derive({
      'spec.md': spec('Draft', 'No gate here.\n'),
      'checklists/requirements.md': '- [x] done\n',
    });
    expect(withChecklist.status).toBe('ready');
  });

  it('derives the post-plan value from phase rows exactly like the write path', () => {
    for (const rows of [['todo', 'todo'], ['done', 'todo'], ['done', 'done'], ['blocked'], ['cancelled', 'skipped']]) {
      const planMd = plan(rows);
      const expected = derivePlanRootStatus(parsePhasesTable(planMd).phases, 'planned');
      expect(derive({ 'spec.md': spec('ready'), 'plan.md': planMd }).status).toBe(expected);
    }
  });

  it('keeps archived sticky from either artifact', () => {
    expect(derive({ 'spec.md': spec('draft'), 'plan.md': plan(['todo'], 'archived') }).status).toBe('archived');
    expect(derive({ 'spec.md': spec('archived'), 'plan.md': plan(['done'], 'done') }).status).toBe('archived');
    expect(derive({ 'spec.md': spec('archived') }).status).toBe('archived');
  });

  it('falls back to the stored spec status with a warning when phases do not parse', () => {
    const result = derive({ 'spec.md': spec('in_progress'), 'plan.md': '# Plan\n\nNo phases.\n' });
    expect(result.status).toBe('in_progress');
    expect(result.warnings).toHaveLength(1);

    const noKey = derive({ 'spec.md': '# Sample\n', 'plan.md': '# Plan\n' });
    expect(noKey.status).toBe('draft');
  });
});

describe('statusMismatchWarnings', () => {
  const stored = readStoredStatuses(spec('Draft'), plan(['done'], 'todo'));

  it('points pre-plan drift at tdk-clarify', () => {
    const warnings = statusMismatchWarnings({
      featureId: 'sample-001', planPath: '/x/plan.md', stored: { spec: 'Draft', plan: null },
      derived: 'ready', hasPlan: false, phasesParseOk: false,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ file: 'spec.md', level: 'status_mismatch', fix: 're-run /tdk-clarify sample-001' });
  });

  it('asks to set the spec status by hand when a spec-only feature stores a post-plan value', () => {
    const warnings = statusMismatchWarnings({
      featureId: 'sample-001', planPath: '/x/plan.md', stored: { spec: 'in_progress', plan: null },
      derived: 'ready', hasPlan: false, phasesParseOk: false,
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ file: 'spec.md', fix: 'set spec.md status: to ready' });
  });

  it('points post-plan drift at reconcile-root and compares each artifact on its own vocabulary', () => {
    const warnings = statusMismatchWarnings({
      featureId: 'sample-001', planPath: '/x/plan.md', stored, derived: 'done', hasPlan: true, phasesParseOk: true,
    });
    // plan root `todo` is a legacy alias of `planned`, still different from `done`; spec `Draft` is `draft`
    expect(warnings.map(w => w.file)).toEqual(['spec.md', 'plan.md']);
    for (const warning of warnings) {
      expect(warning.fix).toBe('(cd .specify/scripts/ts && bun src/commands/util/update-phase-status.ts --reconcile-root "/x/plan.md")');
    }
  });

  it('stays silent when stored values already match or the plan cannot be parsed', () => {
    expect(statusMismatchWarnings({
      featureId: 'sample-001', planPath: '/x/plan.md', stored: { spec: 'done', plan: 'done' },
      derived: 'done', hasPlan: true, phasesParseOk: true,
    })).toEqual([]);
    expect(statusMismatchWarnings({
      featureId: 'sample-001', planPath: '/x/plan.md', stored, derived: 'draft', hasPlan: true, phasesParseOk: false,
    })).toEqual([]);
  });
});

describe('status collector lifecycle output', () => {
  it('reports a legacy spec-only feature with a passing gate as ready, with a drift warning', () => {
    const root = makeWorkspace();
    writeFeature(root, '.specify/feature/sample-001', { 'spec.md': spec('Draft') });
    const status = runStatus(root, 'sample-001');

    expect(status['feature_status']).toBe('ready');
    expect(status['stored_status']).toEqual({ spec: 'Draft', plan: null });
    expect(status['recommendation']['primary']['command']).toBe('/tdk-plan sample-001');
    expect(status['recommendation']['alternative']['command']).toBe('/tdk-plan sample-001 --tdd');
    const mismatch = status['warnings'].find((w: Record<string, unknown>) => w['level'] === 'status_mismatch');
    expect(mismatch).toMatchObject({ file: 'spec.md', stored: 'Draft', derived: 'ready' });
    expect(mismatch['fix']).toContain('/tdk-clarify');
  });

  it('reports draft and recommends tdk-clarify when the gate fails', () => {
    const root = makeWorkspace();
    writeFeature(root, '.specify/feature/sample-001', { 'spec.md': spec('draft', GATE_FAIL) });
    const status = runStatus(root, 'sample-001');

    expect(status['feature_status']).toBe('draft');
    expect(status['recommendation']['primary']['command']).toBe('/tdk-clarify sample-001');
    expect(status['warnings'].some((w: Record<string, unknown>) => w['level'] === 'status_mismatch')).toBe(false);
  });

  it('recommends tdk-plan, not tdk-implement, when only blocked rows remain after done work', () => {
    const root = makeWorkspace();
    writeFeature(root, '.specify/feature/sample-001', {
      'spec.md': spec('in_progress'),
      'plan.md': plan(['done', 'blocked'], 'in_progress'),
    });
    const status = runStatus(root, 'sample-001');
    expect(status['feature_status']).toBe('in_progress');
    expect(status['recommendation']['primary']['command']).toBe('/tdk-plan sample-001');

    writeFeature(root, '.specify/feature/sample-002', {
      'spec.md': spec('in_progress'),
      'plan.md': plan(['done', 'blocked', 'todo'], 'in_progress'),
    });
    expect(runStatus(root, 'sample-002')['recommendation']['primary']['command']).toBe('/tdk-implement sample-002');
  });

  it('derives post-plan status from rows and warns with the reconcile fix line on stored drift', () => {
    const root = makeWorkspace();
    const dir = writeFeature(root, '.specify/feature/sample-001', {
      'spec.md': spec('draft'),
      'plan.md': plan(['done', 'skipped'], 'planned'),
    });
    const status = runStatus(root, 'sample-001');

    expect(status['feature_status']).toBe('done');
    expect(status['phases']['rows']).toHaveLength(2);
    expect(status['stored_status']).toEqual({ spec: 'draft', plan: 'planned' });
    expect(status['recommendation']['primary']['command']).toBe('/tdk-plan sample-001 --ut-backfill');
    const fixes = status['warnings']
      .filter((w: Record<string, unknown>) => w['level'] === 'status_mismatch')
      .map((w: Record<string, unknown>) => w['fix']);
    expect(fixes).toEqual([
      `(cd .specify/scripts/ts && bun src/commands/util/update-phase-status.ts --reconcile-root "${join(dir, 'plan.md')}")`,
      `(cd .specify/scripts/ts && bun src/commands/util/update-phase-status.ts --reconcile-root "${join(dir, 'plan.md')}")`,
    ]);
  });

  it('recommends archiving a done feature that already has UT artifacts, and a cancelled one', () => {
    const root = makeWorkspace();
    writeFeature(root, '.specify/feature/sample-001', {
      'spec.md': spec('done'), 'plan.md': plan(['done'], 'done'), 'ut-spec.md': '# UT\n',
    });
    writeFeature(root, '.specify/feature/sample-002', {
      'spec.md': spec('cancelled'), 'plan.md': plan(['cancelled'], 'cancelled'),
    });
    const done = runStatus(root, 'sample-001');
    const cancelled = runStatus(root, 'sample-002');

    expect(done['feature_status']).toBe('done');
    expect(done['recommendation']['primary']['command']).toBe('/tdk-archive sample-001');
    expect(done['warnings'].some((w: Record<string, unknown>) => w['level'] === 'status_mismatch')).toBe(false);
    expect(cancelled['feature_status']).toBe('cancelled');
    expect(cancelled['recommendation']['primary']['command']).toBe('/tdk-archive sample-002');
  });

  it('resolves archive/<folder>/<id> and recommends the next retro step with the canonical id', () => {
    const root = makeWorkspace();
    writeFeature(root, '.specify/archive/feature/sample-009', {
      'spec.md': spec('archived'), 'plan.md': plan(['done'], 'archived'),
    });
    const status = runStatus(root, 'archive/feature/sample-009');

    expect(status['error']).toBeUndefined();
    expect(status['feature_status']).toBe('archived');
    expect(status['archived']).toBe(true);
    expect(status['recommendation']['primary']['command']).toBe('/tdk-retro-collect feature/sample-009');
  });

  it('uses the same derivation in list mode, including the gate for spec-only features', () => {
    const root = makeWorkspace();
    writeFeature(root, '.specify/feature/sample-001', { 'spec.md': spec('Draft') });
    writeFeature(root, '.specify/feature/sample-002', { 'spec.md': spec('draft', GATE_FAIL) });
    writeFeature(root, '.specify/feature/sample-003', { 'spec.md': spec('draft'), 'plan.md': plan(['done', 'todo']) });
    const { features } = runStatus(root);
    const byId = Object.fromEntries(features.map((f: Record<string, string>) => [f['id'], f['feature_status']]));

    expect(byId).toEqual({ 'sample-001': 'ready', 'sample-002': 'draft', 'sample-003': 'in_progress' });
  });
});
