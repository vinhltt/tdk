import { afterAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { deriveRetroStatus } from '../src/commands/feature/feature-retro-status';
import { makeRepo } from './fixtures/polyrepo';

const STATUS_SOURCE = resolve(import.meta.dir, '../src/commands/feature/status.ts');
const STATUS_SKILL = resolve(import.meta.dir, '../../../plugins/tdk-core/skills/tdk-status/SKILL.md');
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

const spec = (status: string): string => `---\nstatus: ${status}\n---\n\n# Sample feature\n\n${GATE_PASS}`;

function plan(rowStatuses: string[], rootStatus: string): string {
  const rows = rowStatuses.map((status, i) => {
    const n = String(i + 1).padStart(2, '0');
    return `| ${n} | [phase-${n}-sample](phase-${n}-sample.md) | ${status} | — | — |`;
  });
  return [
    `---\nstatus: ${rootStatus}\n---\n\n# Plan`, '', '## Phases', '',
    '| # | File | Status | Blocks | BlockedBy |', '|---|---|---|---|---|', ...rows, '',
  ].join('\n');
}

function delta(...statuses: string[]): string {
  const entries = statuses.map((status, i) => [
    `### Entry ${i + 1}`, `- status: ${status}`, '- severity: high', '- content:', '  ```markdown', '  - status: proposed', '  ```', '',
  ].join('\n'));
  return ['# Learning Delta - sample-001', '', '## Entries', '', ...entries].join('\n');
}

function makeWorkspace(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'tdk-retro-status-')));
  roots.push(root);
  makeRepo(root, 'main');
  mkdirSync(join(root, '.specify'), { recursive: true });
  writeFileSync(join(root, '.specify/.specify.json'), JSON.stringify({ name: 'sample-workspace' }));
  return root;
}

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
    cwd: root, encoding: 'utf-8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return JSON.parse(stdout);
}

describe('deriveRetroStatus', () => {
  const root = makeWorkspace();
  let n = 0;
  const derive = (files: Record<string, string>) => deriveRetroStatus(writeFeature(root, `case-${n++}`, files));

  it('reports none without retro-feedback.md, even when a delta exists', () => {
    expect(derive({})).toEqual({ retro_status: 'none', blocked: 0 });
    expect(derive({ 'learning-delta.md': delta('applied') }).retro_status).toBe('none');
  });

  it('reports collected when feedback exists but the delta does not', () => {
    expect(derive({ 'retro-feedback.md': '# Feedback\n' })).toEqual({ retro_status: 'collected', blocked: 0 });
  });

  it('reports proposed while any entry is proposed or approved', () => {
    for (const statuses of [['proposed'], ['applied', 'approved'], ['rejected', 'blocked', 'proposed']]) {
      expect(derive({ 'retro-feedback.md': '#\n', 'learning-delta.md': delta(...statuses) }).retro_status).toBe('proposed');
    }
  });

  it('reports done when every entry is terminal, with the blocked count', () => {
    expect(derive({ 'retro-feedback.md': '#\n', 'learning-delta.md': delta('applied', 'rejected', 'blocked', 'blocked') }))
      .toEqual({ retro_status: 'done', blocked: 2 });
  });

  it('never reads a status line quoted inside entry content', () => {
    // each fixture entry quotes an indented `- status: proposed` line in its content block
    expect(derive({ 'retro-feedback.md': '#\n', 'learning-delta.md': delta('applied') }).retro_status).toBe('done');
  });

  it('does not report done for a delta with no readable entries or an unknown status', () => {
    expect(derive({ 'retro-feedback.md': '#\n', 'learning-delta.md': '# Learning Delta\n' }).retro_status).toBe('proposed');
    expect(derive({ 'retro-feedback.md': '#\n', 'learning-delta.md': delta('applied', 'pending') }).retro_status).toBe('proposed');
  });

  it('reports proposed when learning-delta.md exists but is a directory', () => {
    const dir = writeFeature(root, `case-${n++}`, { 'retro-feedback.md': '#\n' });
    mkdirSync(join(dir, 'learning-delta.md'));
    expect(deriveRetroStatus(dir)).toEqual({ retro_status: 'proposed', blocked: 0 });
  });

  it.skipIf(process.getuid?.() === 0)('reports proposed when learning-delta.md exists but cannot be read', () => {
    const dir = writeFeature(root, `case-${n++}`, { 'retro-feedback.md': '#\n', 'learning-delta.md': delta('applied') });
    chmodSync(join(dir, 'learning-delta.md'), 0o000);
    try {
      expect(deriveRetroStatus(dir)).toEqual({ retro_status: 'proposed', blocked: 0 });
    } finally {
      chmodSync(join(dir, 'learning-delta.md'), 0o644);
    }
  });
});

describe('status recommendations and archived specs', () => {
  const root = makeWorkspace();
  const feature = (id: string, files: Record<string, string>) => writeFeature(root, `.specify/feature/${id}`, files);
  const done = (extra: Record<string, string> = {}) => ({ 'spec.md': spec('done'), 'plan.md': plan(['done'], 'done'), ...extra });
  const command = (s: Record<string, any>, key = 'primary'): string | undefined => s['recommendation'][key]?.['command'];

  it('done without UT: ut-backfill first, review second', () => {
    feature('sample-001', done());
    const s = runStatus(root, 'sample-001');
    expect(command(s)).toBe('/tdk-plan sample-001 --ut-backfill');
    expect(command(s, 'alternative')).toBe('/tdk-review sample-001');
  });

  it('done with UT: review before archive, and no retro alternative before archive', () => {
    feature('sample-002', done({ 'ut-spec.md': '# UT\n' }));
    const s = runStatus(root, 'sample-002');
    expect(command(s)).toBe('/tdk-review sample-002');
    expect(s['recommendation']['alternative']).toBeUndefined();

    feature('sample-003', done({ 'ut-spec.md': '# UT\n', 'retro-feedback.md': '#\n', 'learning-delta.md': delta('applied') }));
    const finished = runStatus(root, 'sample-003');
    expect(command(finished)).toBe('/tdk-review sample-003');
    expect(finished['recommendation']['alternative']).toBeUndefined();
  });

  it('cancelled: archive', () => {
    feature('sample-004', { 'spec.md': spec('cancelled'), 'plan.md': plan(['cancelled'], 'cancelled') });
    expect(command(runStatus(root, 'sample-004'))).toBe('/tdk-archive sample-004');
  });

  it('never recommends the raw archive script', () => {
    for (const id of ['sample-001', 'sample-002', 'sample-004']) {
      expect(JSON.stringify(runStatus(root, id)['recommendation'])).not.toContain('archive.ts');
    }
  });

  const archivedFiles = (retro: Record<string, string>) => ({ 'spec.md': spec('archived'), 'plan.md': plan(['done'], 'archived'), ...retro });
  const matrix: Array<[string, string, Record<string, string>, string]> = [
    ['sample-010', 'none', {}, '/tdk-retro-collect feature/sample-010'],
    ['sample-011', 'collected', { 'retro-feedback.md': '#\n' }, '/tdk-retro-propose feature/sample-011'],
    ['sample-012', 'proposed', { 'retro-feedback.md': '#\n', 'learning-delta.md': delta('proposed') }, '/tdk-retro-apply feature/sample-012'],
    ['sample-013', 'done', { 'retro-feedback.md': '#\n', 'learning-delta.md': delta('applied') }, ''],
  ];
  for (const [id, retro, files, expected] of matrix) {
    it(`archived with retro ${retro}: canonical id, by explicit and bare input`, () => {
      writeFeature(root, `.specify/archive/feature/${id}`, archivedFiles(files));
      for (const input of [`archive/feature/${id}`, id]) {
        const s = runStatus(root, input);
        expect(s['archived']).toBe(true);
        expect(s['retro_status']).toBe(retro);
        expect(command(s)).toBe(expected);
        expect(JSON.stringify(s['recommendation'])).not.toContain('archive/');
      }
    });
  }

  it('says retro is complete when nothing is left to do', () => {
    expect(runStatus(root, 'sample-013')['recommendation']['primary']['reason']).toBe('Feature archived, retro and memory complete');
  });

  it('resolves an archived spec by bare id without a status mismatch warning', () => {
    writeFeature(root, '.specify/archive/feature/sample-014', {
      'spec.md': spec('done'), 'plan.md': plan(['done'], 'archived'),
    });
    const s = runStatus(root, 'sample-014');
    expect(s['feature_status']).toBe('archived');
    expect(s['location']).toBe('.specify/archive/feature/sample-014');
    expect(s['warnings'].some((w: Record<string, unknown>) => w['level'] === 'status_mismatch')).toBe(false);
  });

  it('lists archived specs of the default folder with archived and retro_status', () => {
    writeFeature(root, '.specify/archive/hotfix/sample-020', archivedFiles({}));
    const { features } = runStatus(root);
    const byId = Object.fromEntries(features.map((f: Record<string, unknown>) => [f['id'], f]));

    expect(byId['sample-012']).toMatchObject({ feature_status: 'archived', archived: true, retro_status: 'proposed' });
    expect(byId['sample-001']).toMatchObject({ archived: false, retro_status: 'none' });
    expect(byId['sample-020']).toBeUndefined();
    expect(runStatus(root, 'archive/hotfix/sample-020')['archived']).toBe(true);
  });

  it('reports a missing feature without falling back to the archive for explicit folders', () => {
    expect(() => runStatus(root, 'hotfix/sample-999')).toThrow();
  });

  it('documents the archived and retro fields it emits', () => {
    const skill = readFileSync(STATUS_SKILL, 'utf-8');
    const s = runStatus(root, 'sample-012');
    for (const key of ['archived', 'retro_status', 'retro_blocked']) {
      expect(s).toHaveProperty(key);
      expect(skill).toContain(`\`${key}\``);
    }
  });
});
