// Behavior: the prior-learning lookup block, extracted verbatim from its reference and run by plain bash
// on throwaway spec layouts. The block that ships and the block under test are always the same text.
import { afterAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const LOOKUP_PATH = resolve(import.meta.dir, '../skills/_shared/prior-learning-lookup.md');
const PLACEHOLDERS = ['FEATURE_DIR', 'TASK_ID', 'ARCHIVED', 'TARGET_PATH', 'DOMAIN', 'KEYWORD', 'PRIOR_ID'] as const;
const PLACEHOLDER_PATTERN = /(\w+)='\{[^}]*\}'/g;

type LookupInput = Partial<Record<(typeof PLACEHOLDERS)[number], string>> & { FEATURE_DIR: string; TASK_ID: string };

function lookupBlock(): string {
  const text = existsSync(LOOKUP_PATH) ? readFileSync(LOOKUP_PATH, 'utf8') : '';
  const match = /```bash\n([\s\S]*?)\n```/.exec(text);
  if (!match) throw new Error('prior-learning-lookup.md has no bash block');
  return match[1];
}

// The Bash tool of some harnesses wraps grep in a shell function that also matches CRLF lines.
// Dropping exported functions keeps this run on the real grep binary.
const plainEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('BASH_FUNC_')));

function runLookup(input: LookupInput): string {
  const values: Record<string, string | undefined> = input;
  const script = lookupBlock().replace(PLACEHOLDER_PATTERN, (_, name: string) => `${name}='${values[name] ?? ''}'`);
  return execFileSync('bash', ['-c', script], { encoding: 'utf8', env: plainEnv });
}

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'retro-lookup-')));
  roots.push(root);
  return root;
}

function write(root: string, rel: string, content: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

type EntryFields = { status: string; target: string; rationale: string; domain?: string; prior?: string; content?: string };

const entry = (n: number, f: EntryFields): string => [
  `### Entry ${n}`,
  `- status: ${f.status}`,
  '- severity: high',
  `- target_type: ${f.domain ? 'memory' : 'technical'}`,
  `- target_id: ${f.domain ? 'K1' : 'T1'}`,
  `- target_path: \`${f.target}\``,
  '- operation: add',
  ...(f.domain ? [`- domain: ${f.domain}`] : []),
  `- rationale: ${f.rationale}`,
  ...(f.prior ? [`- prior: ${f.prior}`] : []),
  '- evidence:',
  '  - `retro-feedback.md`: sample evidence',
  '- content:',
  '  ```markdown',
  `  ${f.content ?? 'Sample rule.'}`,
  '  ```',
  '',
].join('\n');

const delta = (taskId: string, ...entries: string[]): string =>
  [`# Learning Delta - ${taskId}`, '', '- Generated at: 2026-11-01T00:00:00Z', '', '## Entries', '', ...entries].join('\n');

const deltaPath = (root: string, specRel: string): string => join(root, specRel, 'learning-delta.md');
const hitLines = (out: string, kind: string): string[] => out.split('\n').filter((line) => line.startsWith(`  ${kind} `));
const deltaLines = (out: string): string[] => out.split('\n').filter((line) => line.startsWith('DELTA '));

const CURRENT = '.specify/feature/sample-001';
const ACTIVE_OTHER = '.specify/feature/sample-002';
const ARCHIVED_OTHER = '.specify/archive/feature/sample-000';

// One current spec without a delta, one active spec and one archived spec with deltas: 3 entries in all.
function historyLayout(): string {
  const root = workspace();
  write(root, `${CURRENT}/spec.md`, '# Spec\n');
  write(root, `${ACTIVE_OTHER}/spec.md`, '# Spec\n');
  write(root, `${ACTIVE_OTHER}/learning-delta.md`, delta('feature/sample-002',
    entry(1, { status: 'applied', target: '.claude/rules/testing.md', rationale: 'Mocked database hid a failed migration.' })));
  write(root, `${ARCHIVED_OTHER}/plan.md`, '# Plan\n');
  write(root, `${ARCHIVED_OTHER}/learning-delta.md`, delta('feature/sample-000',
    entry(1, { status: 'applied', target: '.claude/rules/api.md', rationale: 'Unbounded Retry loop exhausted the queue.', content: 'Lists use pagination.' }),
    entry(2, { status: 'rejected', target: 'memory', domain: 'data-model', rationale: 'Store amounts as integers.' })));
  return root;
}

const current = (root: string, extra: Partial<LookupInput> = {}): LookupInput =>
  ({ FEATURE_DIR: join(root, CURRENT), TASK_ID: 'feature/sample-001', ARCHIVED: 'false', ...extra });

describe('prior learning lookup block', () => {
  it('declares exactly the placeholders this test fills, each inside single quotes', () => {
    const names = [...lookupBlock().matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
    expect(names).toEqual([...PLACEHOLDERS]);
  });

  it('counts active and archived specs and reports a target hit', () => {
    const root = historyLayout();
    const out = runLookup(current(root, { TARGET_PATH: '.claude/rules/testing.md' }));
    expect(out).toContain('history: 2 spec active, 1 spec archive, 2 delta, 3 entry');
    expect(deltaLines(out)).toEqual([`DELTA ${deltaPath(root, ACTIVE_OTHER)}`]);
    expect(hitLines(out, 'TARGET')).toHaveLength(1);
  });

  it('does not count directories without spec.md or plan.md as specs', () => {
    const root = historyLayout();
    write(root, '.specify/plugins/tdk-core/SKILL.md', '# Skill\n');
    write(root, '.specify/docs/en/README.md', '# Docs\n');
    write(root, '.specify/docs/vi/learning-delta.md', delta('docs/vi'));
    expect(runLookup(current(root))).toContain('history: 2 spec active, 1 spec archive, 2 delta, 3 entry');
  });

  it('matches target_path exactly, with no prefix, suffix, or ./ normalization', () => {
    const near = workspace();
    write(near, `${CURRENT}/spec.md`, '# Spec\n');
    write(near, `${ACTIVE_OTHER}/spec.md`, '# Spec\n');
    write(near, `${ACTIVE_OTHER}/learning-delta.md`, delta('feature/sample-002',
      entry(1, { status: 'applied', target: '.claude/rules/testing.md.bak', rationale: 'Backup copy.' }),
      entry(2, { status: 'applied', target: 'docs/.claude/rules/testing.md', rationale: 'Nested copy.' }),
      entry(3, { status: 'applied', target: 'README.md', rationale: 'Quotes entry syntax.', content: '- target_path: `.claude/rules/testing.md`' })));
    expect(hitLines(runLookup(current(near, { TARGET_PATH: '.claude/rules/testing.md' })), 'TARGET')).toEqual([]);

    const root = historyLayout();
    expect(hitLines(runLookup(current(root, { TARGET_PATH: './.claude/rules/testing.md' })), 'TARGET')).toEqual([]);
    expect(hitLines(runLookup(current(root, { TARGET_PATH: '.claude/rules/testing.md' })), 'TARGET')).toHaveLength(1);
  });

  it('matches a keyword case-insensitively on rationale lines only', () => {
    const root = historyLayout();
    const onRationale = runLookup(current(root, { KEYWORD: 'retry' }));
    expect(hitLines(onRationale, 'KEYWORD')).toHaveLength(1);
    expect(deltaLines(onRationale)).toEqual([`DELTA ${deltaPath(root, ARCHIVED_OTHER)}`]);
    const onContentOnly = runLookup(current(root, { KEYWORD: 'pagination' }));
    expect(hitLines(onContentOnly, 'KEYWORD')).toEqual([]);
    expect(deltaLines(onContentOnly)).toEqual([]);
  });

  it('matches a memory domain without a target path', () => {
    const out = runLookup(current(historyLayout(), { DOMAIN: 'data-model' }));
    expect(hitLines(out, 'DOMAIN')).toHaveLength(1);
    expect(hitLines(out, 'TARGET')).toEqual([]);
  });

  it('reports empty history without failing when no delta exists', () => {
    const root = historyLayout();
    rmSync(deltaPath(root, ACTIVE_OTHER));
    rmSync(deltaPath(root, ARCHIVED_OTHER));
    const out = runLookup(current(root, { TARGET_PATH: '.claude/rules/testing.md', KEYWORD: 'retry' }));
    expect(out).toContain('history: 2 spec active, 1 spec archive, 0 delta, 0 entry');
    expect(deltaLines(out)).toEqual([]);
  });

  it('resolves the specs root from an archived current spec', () => {
    const root = historyLayout();
    const out = runLookup({ FEATURE_DIR: join(root, ARCHIVED_OTHER), TASK_ID: 'feature/sample-000', ARCHIVED: 'true' });
    expect(out).toContain('history: 2 spec active, 1 spec archive, 2 delta, 3 entry');
    expect(out).not.toContain('NOT CHECKED');
  });

  it('reports NOT CHECKED for the example fixture fallback instead of an empty history', () => {
    const root = workspace();
    write(root, '.specify/examples/specs/RETRO-TEST/ut/plan.md', '# Plan\n');
    write(root, '.specify/examples/specs/RETRO-TEST/retro-feedback.md', '# Feedback\n');
    const out = runLookup({ FEATURE_DIR: join(root, '.specify/examples/specs/RETRO-TEST'), TASK_ID: 'RETRO-TEST', ARCHIVED: 'false' });
    expect(out).toContain(`history: NOT CHECKED (current spec not found under ${join(root, '.specify/examples/specs')})`);
    expect(out).not.toContain('spec active');
  });

  it('finds target and domain hits in a CRLF delta', () => {
    const root = historyLayout();
    for (const rel of [ACTIVE_OTHER, ARCHIVED_OTHER]) {
      const path = deltaPath(root, rel);
      writeFileSync(path, readFileSync(path, 'utf8').replace(/\n/g, '\r\n'));
    }
    expect(hitLines(runLookup(current(root, { TARGET_PATH: '.claude/rules/testing.md' })), 'TARGET')).toHaveLength(1);
    expect(hitLines(runLookup(current(root, { DOMAIN: 'data-model' })), 'DOMAIN')).toHaveLength(1);
  });

  it('prints DELTA only for files with a hit while still counting every delta', () => {
    const root = historyLayout();
    const out = runLookup(current(root, { DOMAIN: 'data-model' }));
    expect(deltaLines(out)).toEqual([`DELTA ${deltaPath(root, ARCHIVED_OTHER)}`]);
    expect(out).toContain('2 delta, 3 entry');
  });

  it('finds the entry that supersedes a prior by id, even on another target file', () => {
    const root = historyLayout();
    write(root, `${ACTIVE_OTHER}/learning-delta.md`, delta('feature/sample-002',
      entry(1, { status: 'applied', target: '.claude/rules/naming-conventions.md', rationale: 'Rename rule.',
        prior: 'feature/sample-000#Entry 1: reverses; feature/sample-000#Entry 11: related' })));
    write(root, '.specify/feature/sample-003/spec.md', '# Spec\n');
    write(root, '.specify/feature/sample-003/learning-delta.md', delta('feature/sample-003',
      entry(1, { status: 'applied', target: '.claude/rules/naming.md', rationale: 'Other rule.', prior: 'feature/sample-000#Entry 11: reverses' })));
    const out = runLookup(current(root, { PRIOR_ID: 'feature/sample-000#Entry 1' }));
    expect(hitLines(out, 'NAMED')).toHaveLength(1);
    expect(deltaLines(out)).toEqual([`DELTA ${deltaPath(root, ACTIVE_OTHER)}`]);
  });
});
