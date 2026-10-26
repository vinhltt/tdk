import { afterEach, describe, expect, it } from 'bun:test';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { writeReviewReport } from '../scripts/review-write-report';

const BUNDLE = resolve(import.meta.dir, '../scripts/review-write-report.js');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function project(): { root: string; feature: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'review-report-')));
  roots.push(root);
  const feature = join(root, 'specs', 'task-1');
  mkdirSync(feature, { recursive: true });
  return { root, feature };
}

const NOW = new Date(2026, 9, 11, 9, 5, 7);

describe('review-write-report', () => {
  it('creates reviews/<local timestamp>-<slug>.md and leaves every other file in the feature dir alone', () => {
    const { root, feature } = project();
    writeFileSync(join(feature, 'plan.md'), 'plan');
    const result = writeReviewReport(root, feature, 'standard-review', '# report\n', NOW);
    expect(result).toEqual({ ok: true, path: join(feature, 'reviews', '20261011-090507-standard-review.md'), redactions: 0 });
    expect(readFileSync(join(feature, 'reviews', '20261011-090507-standard-review.md'), 'utf-8')).toBe('# report\n');
    expect(readdirSync(feature).sort()).toEqual(['plan.md', 'reviews']);
  });

  it('a same-second, same-slug rerun stops with collision_exists and the first report stays byte-identical (AC2)', () => {
    const { root, feature } = project();
    writeReviewReport(root, feature, 'standard-review', 'first', NOW);
    const second = writeReviewReport(root, feature, 'standard-review', 'second', NOW);
    expect(second).toEqual({ ok: false, error: 'collision_exists' });
    expect(readFileSync(join(feature, 'reviews', '20261011-090507-standard-review.md'), 'utf-8')).toBe('first');
    expect(readdirSync(join(feature, 'reviews'))).toHaveLength(1);
  });

  it('a different second or a different slug is a new file, never a replacement', () => {
    const { root, feature } = project();
    writeReviewReport(root, feature, 'a', 'one', NOW);
    expect(writeReviewReport(root, feature, 'a', 'two', new Date(NOW.getTime() + 1000)).ok).toBe(true);
    expect(writeReviewReport(root, feature, 'b', 'three', NOW).ok).toBe(true);
    expect(readdirSync(join(feature, 'reviews'))).toHaveLength(3);
  });

  it('a dangling symlink at the target counts as a collision and is not written through', () => {
    const { root, feature } = project();
    mkdirSync(join(feature, 'reviews'));
    const outside = join(root, 'outside.txt');
    symlinkSync(outside, join(feature, 'reviews', '20261011-090507-link.md'));
    expect(writeReviewReport(root, feature, 'link', 'x', NOW)).toEqual({ ok: false, error: 'collision_exists' });
    expect(() => readFileSync(outside)).toThrow();
  });

  it.each(['', 'Upper', 'has space', '../escape', 'a/b', '-lead', 'trail-', 'dou--ble', 'x'.repeat(51)])('rejects the slug %p', (slug) => {
    const { root, feature } = project();
    expect(writeReviewReport(root, feature, slug, 'x', NOW)).toEqual({ ok: false, error: 'invalid_slug' });
    expect(readdirSync(feature)).toEqual([]);
  });

  it('accepts a 50-character slug', () => {
    const { root, feature } = project();
    expect(writeReviewReport(root, feature, 'x'.repeat(50), 'x', NOW).ok).toBe(true);
  });

  it('refuses a reviews/ that is a symlink out of the feature dir, and a feature dir outside the project root', () => {
    const { root, feature } = project();
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'review-elsewhere-')));
    roots.push(elsewhere);
    symlinkSync(elsewhere, join(feature, 'reviews'));
    expect(writeReviewReport(root, feature, 'x', 'x', NOW)).toEqual({ ok: false, error: 'unsafe_output_path' });
    expect(readdirSync(elsewhere)).toEqual([]);
    expect(writeReviewReport(root, elsewhere, 'x', 'x', NOW)).toEqual({ ok: false, error: 'unsafe_output_path' });
  });

  it('refuses a reviews entry that is a regular file', () => {
    const { root, feature } = project();
    writeFileSync(join(feature, 'reviews'), 'not a dir');
    expect(writeReviewReport(root, feature, 'x', 'x', NOW)).toEqual({ ok: false, error: 'unsafe_output_path' });
    expect(readFileSync(join(feature, 'reviews'), 'utf-8')).toBe('not a dir');
  });

  it('refuses a feature dir that does not exist', () => {
    const { root, feature } = project();
    expect(writeReviewReport(root, join(feature, 'missing'), 'x', 'x', NOW)).toEqual({ ok: false, error: 'unsafe_output_path' });
  });

  it.skipIf(process.getuid?.() === 0)('reports write_failed, with nothing left behind, when reviews/ is not writable', () => {
    const { root, feature } = project();
    mkdirSync(join(feature, 'reviews'));
    chmodSync(join(feature, 'reviews'), 0o500);
    try {
      expect(writeReviewReport(root, feature, 'x', 'x', NOW)).toEqual({ ok: false, error: 'write_failed' });
      expect(readdirSync(join(feature, 'reviews'))).toEqual([]);
    } finally { chmodSync(join(feature, 'reviews'), 0o700); }
  });
});

describe('review-write-report bundle', () => {
  async function run(root: string, feature: string, slug: string, body: string, bundle = BUNDLE, extra: string[] = []) {
    const proc = Bun.spawn([process.execPath, '--no-install', bundle, '--project-root', root, '--feature-dir', feature, '--slug', slug, ...extra], {
      cwd: root, stdin: new Blob([body]), stdout: 'pipe', stderr: 'pipe',
      env: { ...process.env, TZ: Intl.DateTimeFormat().resolvedOptions().timeZone },
    });
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    return { exitCode: await proc.exited, stderr, payload: JSON.parse(stdout) };
  }

  it('writes stdin verbatim and prints {ok, path}', async () => {
    const { root, feature } = project();
    const body = '---\nverdict: pass\n---\nBody with unicode: tiếng Việt\n';
    const first = await run(root, feature, 'cli-case', body);
    expect(first.exitCode).toBe(0);
    expect(first.payload.ok).toBe(true);
    expect(readFileSync(first.payload.path, 'utf-8')).toBe(body);
    expect(first.payload.path).toMatch(/reviews[\\/]\d{8}-\d{6}-cli-case\.md$/);
  });

  it('exits 1 with an error envelope for an invalid slug and writes nothing', async () => {
    const { root, feature } = project();
    const result = await run(root, feature, 'Bad Slug', 'x');
    expect(result.exitCode).toBe(1);
    expect(result.payload).toEqual({ ok: false, error: 'invalid_slug' });
    expect(readdirSync(feature)).toEqual([]);
  });

  /** The whole skill dir copied outside any project, so nothing under a consumer `.specify/scripts/ts` can be imported. */
  function isolatedBundle(): string {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'review-skill-')));
    roots.push(dir);
    // Only what ships: scripts/ without node_modules. tests/ and anything else stays behind.
    cpSync(resolve(BUNDLE, '..'), join(dir, 'tdk-review', 'scripts'), { recursive: true, filter: (src) => !src.includes('node_modules') });
    return join(dir, 'tdk-review', 'scripts', 'review-write-report.js');
  }

  it('writes a report from a copy of the skill dir that lives outside any project', async () => {
    const { root, feature } = project();
    const result = await run(root, feature, 'lone', 'first', isolatedBundle());
    expect(result.exitCode).toBe(0);
    expect(readFileSync(result.payload.path, 'utf-8')).toBe('first');
  });

  it('a target that already exists for this second collides through the bundle and stays byte-identical (AC2)', async () => {
    const { root, feature } = project();
    // Occupy every second the spawned bundle could stamp, so the collision path always runs regardless of clock ticks.
    const taken: string[] = [];
    mkdirSync(join(feature, 'reviews'));
    const start = Date.now();
    for (let offset = 0; offset <= 4; offset++) {
      const d = new Date(start + offset * 1000);
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
      const path = join(feature, 'reviews', `${stamp}-lone.md`);
      writeFileSync(path, 'first');
      taken.push(path);
    }
    const second = await run(root, feature, 'lone', 'second', isolatedBundle());
    expect(second.exitCode).toBe(1);
    expect(second.payload).toEqual({ ok: false, error: 'collision_exists' });
    for (const path of taken) expect(readFileSync(path, 'utf-8')).toBe('first');
    expect(readdirSync(join(feature, 'reviews'))).toHaveLength(taken.length);
  });

  it('redacts a planted secret before it reaches disk, keeps SHAs, paths and requirement IDs, and reports the count', async () => {
    const { root, feature } = project();
    const token = `ghp_${'a'.repeat(36)}`;
    const body = ['base_commit: 4a523876183951814192e21e5821bb805b6d334b', 'file: apps/api/src/a.ts:42', `evidence: const t = "${token}";`, 'FR-001 missing'].join('\n');
    const result = await run(root, feature, 'secret-case', body, isolatedBundle());
    expect(result.exitCode).toBe(0);
    expect(result.payload.redactions).toBe(1);
    const written = readFileSync(result.payload.path, 'utf-8');
    expect(written).not.toContain(token);
    expect(written).toContain('[REDACTED:github-token]');
    expect(written).toContain('base_commit: 4a523876183951814192e21e5821bb805b6d334b');
    expect(written).toContain('apps/api/src/a.ts:42');
    expect(written).toContain('FR-001 missing');
  });

  const KEPT_BODY = [
    '## Proposed Fix Phases',
    '/tdk-plan sample-001 "fix the retry loop"',
    'skill: /backend-checks',
    'route: GET /health',
    'html: <span>a</span>',
    'skills_loaded: [/backend-checks]',
  ].join('\n');

  it('keeps slash-command seeds, skill locators, routes and closing tags through the bundle', async () => {
    const { root, feature } = project();
    const result = await run(root, feature, 'kept-case', KEPT_BODY, isolatedBundle());
    expect(result.exitCode).toBe(0);
    expect(result.payload.redactions).toBe(0);
    expect(readFileSync(result.payload.path, 'utf-8')).toBe(KEPT_BODY);
  });

  it('redacts a machine path, a Windows drive path and a token through the bundle while the seed survives', async () => {
    const { root, feature } = project();
    const token = `ghp_${'b'.repeat(36)}`;
    const body = [KEPT_BODY, 'path: /home/fake-person/x', String.raw`drive: C:\Users\FakePerson\x`, `evidence: const t = "${token}";`].join('\n');
    const result = await run(root, feature, 'mixed-case', body, isolatedBundle());
    expect(result.exitCode).toBe(0);
    expect(result.payload.redactions).toBe(3);
    const written = readFileSync(result.payload.path, 'utf-8');
    for (const secret of ['/home/fake-person', 'FakePerson', token]) expect(written).not.toContain(secret);
    expect(written).toContain('/tdk-plan sample-001 "fix the retry loop"');
    expect(written).toContain('skill: /backend-checks');
  });

  it('redacts only the machine path in a body of slash commands and routes through the bundle', async () => {
    const { root, feature } = project();
    const body = [
      '## Proposed Fix Phases',
      '/tdk-plan sample-001 "first fix"',
      '- **Ready line**: `/tdk-plan sample-001 "second fix"`',
      'Re-run `/tdk-review`, then `/tdk-status`, then `/tdk-archive`.',
      'GET /health',
      'skill: /backend-checks',
      'evidence: /home/fake/x',
    ].join('\n');
    const result = await run(root, feature, 'commands-case', body, isolatedBundle());
    expect(result.exitCode).toBe(0);
    expect(result.payload.redactions).toBe(1);
    expect(readFileSync(result.payload.path, 'utf-8')).toBe(body.replace('/home/fake/x', '[REDACTED:absolute-path]'));
  });

  it('redacts only the Git Bash home path inside a seed description through the bundle', async () => {
    const { root, feature } = project();
    const body = '## Proposed Fix Phases\n/tdk-plan sample-001 "fix /c/Users/fake-person/x"';
    const result = await run(root, feature, 'seed-path-case', body, isolatedBundle());
    expect(result.exitCode).toBe(0);
    expect(result.payload.redactions).toBe(1);
    expect(readFileSync(result.payload.path, 'utf-8')).toBe('## Proposed Fix Phases\n/tdk-plan sample-001 "fix [REDACTED:absolute-path]"');
  });

  it('exits 1 with invalid_arguments for an unknown flag or a missing option', async () => {
    const { root, feature } = project();
    const unknown = await run(root, feature, 'x', 'x', BUNDLE, ['--bogus']);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.payload).toEqual({ ok: false, error: 'invalid_arguments' });
    const proc = Bun.spawn([process.execPath, '--no-install', BUNDLE, '--project-root', root], { stdin: new Blob(['x']), stdout: 'pipe', stderr: 'pipe' });
    expect(JSON.parse(await new Response(proc.stdout).text())).toEqual({ ok: false, error: 'invalid_arguments' });
    expect(await proc.exited).toBe(1);
  });
});
