import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { hashArtifactBytes } from '../scripts/scaffold-outcome-record';

const SCRIPT = resolve(import.meta.dir, '../scripts/scaffold-outcome-record.ts');
const RECOMMENDATION = '.specify/configurations/automation-recommendations/sub-workspaces/sample/automation-recommendation.md';
const OTHER_RECOMMENDATION = '.specify/configurations/automation-recommendations/sub-workspaces/sample/other-recommendation.md';
const SIDECAR = '.specify/configurations/automation-recommendations/sub-workspaces/sample/scaffold-outcome.json';
const PROPOSAL = '.specify/configurations/automation-recommendations/sub-workspaces/sample/delegate-routing-proposal.json';
const SKILL = '.claude/skills/sample-skill/SKILL.md';
const SKILL_REFERENCE = '.claude/skills/sample-skill/references/guide.md';
const AGENT = '.claude/agents/sample-agent.md';

const SKILL_ROW = { kind: 'skill', name: 'sample-skill', path: SKILL, outcome: 'created', files: [SKILL_REFERENCE] };
const AGENT_ROW = { kind: 'agent', name: 'sample-agent', path: AGENT, outcome: 'reused' };

const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(path);
  return path;
}

function write(root: string, path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function fixture(): string {
  const root = tempDir('scaffold-outcome-');
  write(root, RECOMMENDATION, '---\nstatus: approved\n---\n# Recommendation\n');
  write(root, OTHER_RECOMMENDATION, '# Other\n');
  write(root, PROPOSAL, '{"version":1}\n');
  write(root, SKILL, '---\nname: sample-skill\n---\n# Sample skill\nline two\n');
  write(root, SKILL_REFERENCE, '# Guide\n');
  write(root, AGENT, '---\nname: sample-agent\n---\n# Sample agent\n');
  return root;
}

interface RunResult { exitCode: number; json: Record<string, unknown> }

function run(root: string, args: string[], rows?: unknown): RunResult {
  const result = Bun.spawnSync([process.execPath, '--no-install', SCRIPT, ...args.flatMap((arg) => (arg === '<root>' ? [root] : [arg]))], {
    stdin: rows === undefined ? 'ignore' : Buffer.from(typeof rows === 'string' ? rows : JSON.stringify(rows)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return { exitCode: result.exitCode ?? -1, json: JSON.parse(result.stdout.toString()) as Record<string, unknown> };
}

const record = (root: string, rows: unknown, extra: string[] = []): RunResult =>
  run(root, ['record', '--project-root', '<root>', '--recommendation', RECOMMENDATION, ...extra], rows);
const compare = (root: string, recommendation = RECOMMENDATION): RunResult =>
  run(root, ['compare', '--project-root', '<root>', '--recommendation', recommendation]);
const readSidecar = (root: string): Record<string, any> => JSON.parse(readFileSync(join(root, SIDECAR), 'utf8'));

/** Every file under the root with its bytes, to prove a refused command changed nothing on disk. */
function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[relative(root, path)] = entry.isSymbolicLink() ? `symlink` : readFileSync(path, 'base64');
    }
  };
  walk(root);
  return files;
}

function expectRefused(root: string, rows: unknown, error: string, extra: string[] = []): void {
  const before = snapshot(root);
  const result = record(root, rows, extra);
  expect(result.exitCode).toBe(1);
  expect(result.json).toMatchObject({ ok: false, error });
  expect(snapshot(root)).toEqual(before);
}

describe('line-ending stable hash', () => {
  const lf = new TextEncoder().encode('alpha\nbeta\ngamma\n');

  it('gives LF, CRLF, and mixed text the same hash, equal to the raw SHA-256 of the LF bytes', () => {
    const crlf = new TextEncoder().encode('alpha\r\nbeta\r\ngamma\r\n');
    const mixed = new TextEncoder().encode('alpha\r\nbeta\ngamma\r\n');
    expect(hashArtifactBytes('SKILL.md', lf)).toBe(sha256(lf));
    expect(hashArtifactBytes('SKILL.md', crlf)).toBe(sha256(lf));
    expect(hashArtifactBytes('notes.YAML', mixed)).toBe(sha256(lf));
  });

  it('keeps a lone CR and a BOM significant', () => {
    expect(hashArtifactBytes('SKILL.md', new TextEncoder().encode('alpha\rbeta\ngamma\n'))).not.toBe(sha256(lf));
    expect(hashArtifactBytes('SKILL.md', new Uint8Array([0xef, 0xbb, 0xbf, ...lf]))).not.toBe(sha256(lf));
  });

  it('hashes files that are not known text as raw bytes', () => {
    const crlf = new TextEncoder().encode('alpha\r\nbeta\r\n');
    expect(hashArtifactBytes('blob.bin', crlf)).toBe(sha256(crlf));
    expect(hashArtifactBytes('blob.bin', crlf)).not.toBe(hashArtifactBytes('blob.bin', new TextEncoder().encode('alpha\nbeta\n')));
  });

  it('folds a CRLF pair that straddles a 64 KiB boundary', () => {
    const head = new Uint8Array(65_535).fill(0x61);
    const tail = new Uint8Array(4_000).fill(0x62);
    const straddling = new Uint8Array([...head, 0x0d, 0x0a, ...tail]);
    expect(straddling[65_535]).toBe(0x0d);
    expect(straddling[65_536]).toBe(0x0a);
    expect(hashArtifactBytes('large.md', straddling)).toBe(sha256(new Uint8Array([...head, 0x0a, ...tail])));
  });
});

describe('record', () => {
  it('writes the first sidecar beside the recommendation with every artifact file hashed', () => {
    const root = fixture();
    const result = record(root, [SKILL_ROW, AGENT_ROW]);
    expect(result.exitCode).toBe(0);
    expect(result.json).toMatchObject({ ok: true, sidecar: SIDECAR, kept: [] });
    expect(result.json.upserted).toEqual([{ kind: 'skill', path: SKILL }, { kind: 'agent', path: AGENT }]);
    const sidecar = readSidecar(root);
    expect(sidecar.version).toBe(1);
    expect(sidecar.recommendation).toMatchObject({ path: RECOMMENDATION, sha256: sha256(readFileSync(join(root, RECOMMENDATION))) });
    expect(sidecar.proposal).toBeNull();
    expect(sidecar.artifacts[0].files.map((file: { path: string }) => file.path)).toEqual([SKILL, SKILL_REFERENCE].sort());
    expect(sidecar.artifacts[1]).toMatchObject({ kind: 'agent', name: 'sample-agent', outcome: 'reused', files: [{ path: AGENT, sha256: sha256(readFileSync(join(root, AGENT))) }] });
    expect(sidecar.artifacts[0].recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(JSON.stringify(sidecar)).not.toMatch(/ready|verify/);
  });

  it('upserts by kind and path and never drops rows it was not given', () => {
    const root = fixture();
    expect(record(root, [SKILL_ROW, AGENT_ROW]).exitCode).toBe(0);
    const aged = readSidecar(root);
    for (const row of aged.artifacts) row.recorded_at = '2020-01-01T00:00:00Z';
    writeFileSync(join(root, SIDECAR), JSON.stringify(aged, null, 2));
    write(root, SKILL, '---\nname: sample-skill\n---\n# Sample skill\npatched\n');

    const result = record(root, [{ ...SKILL_ROW, outcome: 'patched' }]);
    expect(result.exitCode).toBe(0);
    expect(result.json.kept).toEqual([{ kind: 'agent', path: AGENT }]);
    const sidecar = readSidecar(root);
    expect(sidecar.artifacts).toHaveLength(2);
    expect(sidecar.artifacts[1]).toEqual(aged.artifacts[1]);
    expect(sidecar.artifacts[0].outcome).toBe('patched');
    expect(sidecar.artifacts[0].recorded_at).not.toBe('2020-01-01T00:00:00Z');
  });

  it('records the proposal only when given and keeps it on later runs', () => {
    const root = fixture();
    expect(record(root, [SKILL_ROW], ['--proposal', PROPOSAL]).exitCode).toBe(0);
    const first = readSidecar(root).proposal;
    expect(first).toMatchObject({ path: PROPOSAL, sha256: sha256(readFileSync(join(root, PROPOSAL))) });
    expect(record(root, [AGENT_ROW]).exitCode).toBe(0);
    expect(readSidecar(root).proposal).toEqual(first);
  });

  it('reads rows from a file when the host cannot pipe stdin', () => {
    const root = fixture();
    const rowsFile = join(tempDir('scaffold-rows-'), 'rows.json');
    writeFileSync(rowsFile, JSON.stringify([AGENT_ROW]));
    expect(record(root, undefined, ['--rows-file', rowsFile]).exitCode).toBe(0);
    expect(readSidecar(root).artifacts).toHaveLength(1);
  });

  it('refuses a sidecar recorded for another recommendation and keeps its bytes', () => {
    const root = fixture();
    write(root, SIDECAR, JSON.stringify({ version: 1, recommendation: { path: OTHER_RECOMMENDATION, sha256: sha256('x'), recorded_at: '2020-01-01T00:00:00Z' }, proposal: null, artifacts: [] }));
    expectRefused(root, [SKILL_ROW], 'foreign_sidecar');
  });

  it('refuses an unreadable or unsupported sidecar and keeps its bytes', () => {
    const root = fixture();
    write(root, SIDECAR, '{not json');
    expectRefused(root, [SKILL_ROW], 'invalid_sidecar');
    write(root, SIDECAR, JSON.stringify({ version: 2, artifacts: [] }));
    expectRefused(root, [SKILL_ROW], 'invalid_sidecar');
  });

  it('refuses paths that leave the project root, by .. or by symlink', () => {
    const root = fixture();
    expectRefused(root, [{ ...SKILL_ROW, files: ['../outside.md'] }], 'path_outside_root');
    const outside = tempDir('scaffold-outside-');
    writeFileSync(join(outside, 'agent.md'), '# outside\n');
    unlinkSync(join(root, AGENT));
    symlinkSync(join(outside, 'agent.md'), join(root, AGENT));
    expectRefused(root, [AGENT_ROW], 'path_outside_root');
  });

  it('refuses missing files and malformed rows without writing', () => {
    const root = fixture();
    expectRefused(root, [{ ...SKILL_ROW, name: 'absent-skill', path: '.claude/skills/absent-skill/SKILL.md' }], 'missing_file');
    expectRefused(root, [{ ...SKILL_ROW, kind: 'hook' }], 'invalid_rows');
    expectRefused(root, [{ ...SKILL_ROW, path: '.claude/skills/other/SKILL.md' }], 'invalid_rows');
    expectRefused(root, [SKILL_ROW, SKILL_ROW], 'invalid_rows');
    expectRefused(root, '{"rows":', 'invalid_rows');
  });

  it('rejects bad arguments before reading anything', () => {
    const root = fixture();
    expect(run(root, ['record', '--project-root', '<root>'], []).json).toMatchObject({ ok: false, error: 'invalid_args' });
    expect(run(root, ['record', '--project-root', '<root>', '--recommendation', RECOMMENDATION, '--force', 'yes'], []).exitCode).toBe(1);
    expect(run(root, ['erase', '--project-root', '<root>'], []).json).toMatchObject({ ok: false, error: 'invalid_args' });
  });

  it('leaves no temporary file behind', () => {
    const root = fixture();
    expect(record(root, [SKILL_ROW]).exitCode).toBe(0);
    record(root, [{ ...SKILL_ROW, kind: 'hook' }]);
    expect(readdirSync(dirname(join(root, SIDECAR))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

describe('compare', () => {
  it('reports missing, invalid, unsupported, and foreign sidecars without labelling anything unchanged', () => {
    const root = fixture();
    expect(compare(root).json).toEqual({ ok: true, state: 'missing', sidecar: SIDECAR });
    write(root, SIDECAR, '{broken');
    expect(compare(root).json).toMatchObject({ ok: true, state: 'invalid' });
    write(root, SIDECAR, JSON.stringify({ version: 2 }));
    expect(compare(root).json).toMatchObject({ ok: true, state: 'unsupported-version', version: 2 });
    rmSync(join(root, SIDECAR));
    expect(record(root, [SKILL_ROW]).exitCode).toBe(0);
    const foreign = compare(root, OTHER_RECOMMENDATION);
    expect(foreign.exitCode).toBe(0);
    expect(foreign.json).toMatchObject({ ok: true, state: 'foreign', recorded_for: RECOMMENDATION });
    expect(foreign.json.artifacts).toBeUndefined();
  });

  it('labels artifacts unchanged after a line-ending-only rewrite', () => {
    const root = fixture();
    expect(record(root, [SKILL_ROW, AGENT_ROW]).exitCode).toBe(0);
    for (const path of [RECOMMENDATION, SKILL, SKILL_REFERENCE, AGENT]) {
      write(root, path, readFileSync(join(root, path), 'utf8').replace(/\n/g, '\r\n'));
    }
    const result = compare(root);
    expect(result.json).toMatchObject({ ok: true, state: 'present', recommendation_changed: false });
    expect((result.json.artifacts as { label: string }[]).map((row) => row.label)).toEqual(['unchanged', 'unchanged']);
  });

  it('labels a real edit changed and a deleted file missing', () => {
    const root = fixture();
    expect(record(root, [SKILL_ROW, AGENT_ROW]).exitCode).toBe(0);
    write(root, SKILL_REFERENCE, '# Guide\nedited after scaffold\n');
    rmSync(join(root, AGENT));
    const artifacts = compare(root).json.artifacts as { path: string; label: string; recorded_at: string; files: { path: string; label: string }[] }[];
    expect(artifacts[0]).toMatchObject({ path: SKILL, label: 'changed' });
    expect(artifacts[0]?.files).toEqual([{ path: SKILL, label: 'unchanged' }, { path: SKILL_REFERENCE, label: 'changed' }]);
    expect(artifacts[1]).toMatchObject({ path: AGENT, label: 'missing' });
    expect(artifacts[0]?.recorded_at).toMatch(/Z$/);
  });

  it('flags a recommendation edited since the baseline', () => {
    const root = fixture();
    expect(record(root, [SKILL_ROW]).exitCode).toBe(0);
    write(root, RECOMMENDATION, '---\nstatus: approved\n---\n# Recommendation\nnew agent\n');
    expect(compare(root).json).toMatchObject({ state: 'present', recommendation_changed: true });
  });

  it('voids the baseline when a recorded file now resolves outside the root', () => {
    const root = fixture();
    expect(record(root, [AGENT_ROW]).exitCode).toBe(0);
    const outside = tempDir('scaffold-outside-');
    writeFileSync(join(outside, 'agent.md'), readFileSync(join(root, AGENT)));
    unlinkSync(join(root, AGENT));
    symlinkSync(join(outside, 'agent.md'), join(root, AGENT));
    expect(compare(root).json).toMatchObject({ ok: true, state: 'invalid' });
  });

  it('exits 1 only for argument and root errors', () => {
    const root = fixture();
    const outside = run(root, ['compare', '--project-root', '<root>', '--recommendation', '../x.md']);
    expect(outside.exitCode).toBe(1);
    expect(outside.json).toMatchObject({ ok: false, error: 'path_outside_root' });
    expect(run(root, ['compare', '--project-root', '<root>', '--recommendation', RECOMMENDATION, '--proposal', PROPOSAL]).json).toMatchObject({ error: 'invalid_args' });
  });
});
