import { afterAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { writeReviewReport } from '../../../plugins/tdk-core/skills/tdk-review/scripts/review-write-report';
import {
  collectReviewSummary, collectTestEvidence, readMemoryStatus, type PhaseRowLite,
} from '../src/commands/feature/next-action-evidence';

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function makeFeature(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'tdk-evidence-'));
  roots.push(dir);
  write(dir, { 'plan.md': '# Plan\n', ...files });
  return dir;
}

function write(dir: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
}

const row = (number: number, phase_status: string, file = `phase-0${number}-sample.md`): PhaseRowLite =>
  ({ number, file, phase_status });

const TEST_PHASE = '# Phase\n\n## Test Matrix\n\n| case |\n';

describe('collectTestEvidence', () => {
  it('is none for a plain feature', () => {
    const dir = makeFeature({ 'phase-01-sample.md': '# Phase\n\nImplement the thing.\n' });
    expect(collectTestEvidence(dir, 'none', [row(1, 'done')])).toEqual({
      strength: 'none', sources: [], testPhases: [], skippedTestPhases: 0,
    });
  });

  it('is strong from the plan test_mode alone', () => {
    const dir = makeFeature();
    for (const mode of ['tdd', 'ut_backfill'] as const) {
      expect(collectTestEvidence(dir, mode, [])).toMatchObject({ strength: 'strong', sources: ['plan_test_mode'] });
    }
  });

  it('is strong from a done phase with a test-shaped heading, for each heading', () => {
    for (const heading of ['## Test Matrix', '## Tests Before', '## Tests After', '## Regression Gate']) {
      const dir = makeFeature({ 'phase-01-sample.md': `# Phase\n\n${heading}\n` });
      const evidence = collectTestEvidence(dir, 'none', [row(1, 'done')]);
      expect(evidence.strength).toBe('strong');
      expect(evidence.sources).toEqual(['test_phase']);
      expect(evidence.testPhases).toEqual([{ file: 'phase-01-sample.md', phase_status: 'done' }]);
    }
  });

  it('is strong from each UT artifact', () => {
    for (const artifact of ['ut-spec.md', 'ut/plan.md', 'coverage-analysis.md', 'ut-plan.md', 'coverage-report.json']) {
      const dir = makeFeature({ [artifact]: 'x' });
      expect(collectTestEvidence(dir, 'none', [])).toMatchObject({ strength: 'strong', sources: ['ut_artifact'] });
    }
  });

  it('lists every strong source it finds', () => {
    const dir = makeFeature({ 'phase-01-sample.md': TEST_PHASE, 'ut-spec.md': 'x' });
    expect(collectTestEvidence(dir, 'tdd', [row(1, 'done')]).sources).toEqual(['plan_test_mode', 'test_phase', 'ut_artifact']);
  });

  it('does not count a skipped test phase as evidence, but counts it', () => {
    const dir = makeFeature({ 'phase-01-sample.md': TEST_PHASE, 'phase-02-sample.md': TEST_PHASE });
    const evidence = collectTestEvidence(dir, 'none', [row(1, 'skipped'), row(2, 'skipped')]);
    expect(evidence).toMatchObject({ strength: 'none', sources: [], skippedTestPhases: 2 });
    expect(evidence.testPhases).toHaveLength(2);
  });

  it('does not count a todo or in_progress test phase as evidence', () => {
    const dir = makeFeature({ 'phase-01-sample.md': TEST_PHASE, 'phase-02-sample.md': TEST_PHASE });
    expect(collectTestEvidence(dir, 'none', [row(1, 'todo'), row(2, 'in_progress')]).strength).toBe('none');
  });

  it('is weak when a done phase references a test path without test-shaped headings', () => {
    for (const ref of ['src/a.test.ts', 'src/a.spec.js', 'pkg/a_test.go', 'run tests/unit now']) {
      const dir = makeFeature({ 'phase-01-sample.md': `# Phase\n\nTouches ${ref}.\n` });
      expect(collectTestEvidence(dir, 'none', [row(1, 'done')])).toMatchObject({
        strength: 'weak', sources: ['phase_test_file_ref'],
      });
    }
  });

  it('ignores a test path referenced by a phase that is not done', () => {
    const dir = makeFeature({ 'phase-01-sample.md': '# Phase\n\nTouches src/a.test.ts.\n' });
    expect(collectTestEvidence(dir, 'none', [row(1, 'todo')]).strength).toBe('none');
  });

  it('prefers strong over weak evidence', () => {
    const dir = makeFeature({ 'phase-01-sample.md': 'See src/a.test.ts\n', 'ut-plan.md': 'x' });
    expect(collectTestEvidence(dir, 'none', [row(1, 'done')])).toMatchObject({ strength: 'strong', sources: ['ut_artifact'] });
  });

  it('resolves phase files from rows for both root and phases/ layouts, and skips missing files', () => {
    const dir = makeFeature({
      'phase-01-sample.md': TEST_PHASE,
      'phases/phase-02-sample.md': '# Phase\n\n## Regression Gate\n',
    });
    const rows = [row(1, 'skipped'), row(2, 'done', 'phases/phase-02-sample.md'), row(3, 'done', 'phase-03-missing.md')];
    expect(collectTestEvidence(dir, 'none', rows)).toMatchObject({
      strength: 'strong', sources: ['test_phase'], skippedTestPhases: 1,
    });
  });
});

function review(fields: Record<string, string>, body = '# Review\n'): string {
  const frontmatter = Object.entries({ task_id: 'sample-001', scope: 'full', ...fields })
    .map(([key, value]) => `${key}: ${value}`).join('\n');
  return `---\n${frontmatter}\n---\n\n${body}`;
}

const fixPhases = (...lines: string[]): string =>
  ['# Review', '', '## Proposed Fix Phases', '', ...lines, '', '## Next actions', '', '- none', ''].join('\n');

describe('collectReviewSummary', () => {
  const summarize = (dir: string, rows: PhaseRowLite[] = []) => collectReviewSummary(dir, 'sample-001', rows);

  it('is empty without a reviews directory, or when reviews is not a directory', () => {
    expect(summarize(makeFeature())).toEqual({ count: 0, fullCount: 0, latestFull: null, latestAny: null, ignored: [] });
    expect(summarize(makeFeature({ reviews: 'not a directory' })).count).toBe(0);
  });

  it('counts only files whose frontmatter carries a verdict', () => {
    const dir = makeFeature({
      'reviews/20261010-090000-full-standard.md': review({ verdict: 'pass', generated_at: '2026-10-10T09:00:00+07:00' }),
      'reviews/analyze-report.md': '# Analyze\n',
      'reviews/notes.md': '---\ntitle: notes\n---\n\nbody\n',
      'reviews/broken.md': '---\nverdict: [unclosed\n---\n',
      'reviews/readme.txt': 'ignored by extension',
    });
    const summary = summarize(dir);
    expect(summary.count).toBe(1);
    expect(summary.ignored).toEqual(['reviews/analyze-report.md', 'reviews/broken.md', 'reviews/notes.md']);
  });

  it('maps an unrecognised verdict to unknown', () => {
    const dir = makeFeature({ 'reviews/20261010-090000-full.md': review({ verdict: 'maybe', generated_at: '2026-10-10T09:00:00+07:00' }) });
    expect(summarize(dir).latestFull?.verdict).toBe('unknown');
  });

  it('separates the latest full review from the latest review of any scope', () => {
    const dir = makeFeature({
      'reviews/20261010-090000-full.md': review({ verdict: 'changes_requested', generated_at: '2026-10-10T09:00:00+07:00' }),
      'reviews/20261011-090000-phase-02.md': review({ verdict: 'pass', scope: 'phase-02', generated_at: '2026-10-11T09:00:00+07:00' }),
    });
    const summary = summarize(dir);
    expect(summary).toMatchObject({ count: 2, fullCount: 1 });
    expect(summary.latestFull?.verdict).toBe('changes_requested');
    expect(summary.latestAny?.scope).toBe('phase-02');
  });

  it('leaves latestFull null when only phase-scoped reviews exist', () => {
    const dir = makeFeature({
      'reviews/20261011-090000-phase-02.md': review({ verdict: 'pass', scope: 'phase-02', generated_at: '2026-10-11T09:00:00+07:00' }),
    });
    expect(summarize(dir)).toMatchObject({ count: 1, fullCount: 0, latestFull: null });
  });

  it('does not treat a report without a scope as a full review', () => {
    const dir = makeFeature({ 'reviews/20261010-090000-x.md': '---\nverdict: pass\ngenerated_at: 2026-10-10T09:00:00+07:00\n---\n' });
    expect(summarize(dir)).toMatchObject({ count: 1, fullCount: 0, latestFull: null });
  });

  it('orders by generated_at, not by file name', () => {
    const dir = makeFeature({
      'reviews/20261012-000000-a.md': review({ verdict: 'blocked', generated_at: '2026-10-10T09:00:00+07:00' }),
      'reviews/20261001-000000-b.md': review({ verdict: 'pass', generated_at: '2026-10-11T09:00:00+07:00' }),
    });
    expect(summarize(dir).latestFull?.verdict).toBe('pass');
  });

  it('falls back to the file name timestamp, then the file name, when generated_at is missing', () => {
    const byStamp = makeFeature({
      'reviews/20261010-090000-a.md': '---\nverdict: blocked\nscope: full\n---\n',
      'reviews/20261011-090000-b.md': '---\nverdict: pass\nscope: full\n---\n',
    });
    expect(summarize(byStamp).latestFull?.verdict).toBe('pass');

    const byName = makeFeature({
      'reviews/a-review.md': '---\nverdict: blocked\nscope: full\n---\n',
      'reviews/b-review.md': '---\nverdict: pass\nscope: full\n---\n',
    });
    expect(summarize(byName).latestFull?.verdict).toBe('pass');
  });

  it('reports blocked_reason only for blocked reviews', () => {
    for (const reason of ['empty_scope', 'working_tree_changed', 'all_reviewers_failed']) {
      const dir = makeFeature({ 'reviews/20261010-090000-full.md': review({ verdict: 'blocked', blocked_reason: reason, generated_at: '2026-10-10T09:00:00+07:00' }) });
      expect(summarize(dir).latestFull?.blockedReason).toBe(reason);
    }
    const passing = makeFeature({ 'reviews/20261010-090000-full.md': review({ verdict: 'pass', blocked_reason: 'empty_scope', generated_at: '2026-10-10T09:00:00+07:00' }) });
    expect(summarize(passing).latestFull?.blockedReason).toBe('');
  });

  describe('fix seeds', () => {
    const seedLine = (id: string, text: string) => `/tdk-plan ${id} "${text}"`;
    const withBody = (body: string) => makeFeature({
      'reviews/20261010-090000-full.md': review({ verdict: 'changes_requested', generated_at: '2026-10-10T09:00:00+07:00' }, body),
    });

    it('reads 0 seeds for None., a missing section, and lines for another task', () => {
      for (const body of [fixPhases('None.'), '# Review\n', fixPhases(seedLine('sample-999', 'other task'))]) {
        expect(summarize(withBody(body)).latestFull).toMatchObject({ seedCount: 0, seedReady: null });
      }
    });

    it('keeps the single Ready line verbatim', () => {
      const line = seedLine('sample-001', 'Fix the retry loop in the client');
      expect(summarize(withBody(fixPhases('- **Description**: x', line))).latestFull).toMatchObject({ seedCount: 1, seedReady: line });
    });

    it('counts several seeds without choosing one', () => {
      const body = fixPhases(seedLine('sample-001', 'one'), seedLine('sample-001', 'two'), seedLine('sample-001', 'three'));
      expect(summarize(withBody(body)).latestFull).toMatchObject({ seedCount: 3, seedReady: null });
    });

    it('accepts a Ready line inside a bullet with bold label and backticks, returning the clean command', () => {
      const command = seedLine('sample-001', 'fix x');
      const body = fixPhases(`- **Ready line**: \`${command}\``);
      expect(summarize(withBody(body)).latestFull).toMatchObject({ seedCount: 1, seedReady: command });
    });

    it('counts several bullet seeds, and still reads a bare line', () => {
      const bullets = fixPhases(
        `- **Ready line**: \`${seedLine('sample-001', 'one')}\``,
        `- **Ready line**: \`${seedLine('sample-001', 'two')}\``,
      );
      expect(summarize(withBody(bullets)).latestFull).toMatchObject({ seedCount: 2, seedReady: null });
      const bare = seedLine('sample-001', 'bare');
      expect(summarize(withBody(fixPhases(bare))).latestFull).toMatchObject({ seedCount: 1, seedReady: bare });
    });

    it('ignores a bullet whose command does not end with a quote', () => {
      const body = fixPhases('- **Ready line**: `/tdk-plan sample-001 "unterminated');
      expect(summarize(withBody(body)).latestFull?.seedCount).toBe(0);
    });

    it('stops at the next section', () => {
      const body = `${fixPhases('None.')}\n${seedLine('sample-001', 'after the section')}\n`;
      expect(summarize(withBody(body)).latestFull?.seedCount).toBe(0);
    });
  });

  describe('staleness', () => {
    // The review helper stamps the file name from the local clock, so the tests build epochs the same way.
    const STAMP = '20261010-090000';
    const stampSeconds = new Date(2026, 9, 10, 9, 0, 0).getTime() / 1000;
    const GENERATED = '2026-10-10T09:00:00+07:00';
    const touch = (path: string, deltaSeconds: number) =>
      utimesSync(path, stampSeconds + deltaSeconds, stampSeconds + deltaSeconds);
    const reviewFile = `reviews/${STAMP}-full.md`;

    it('is fresh when plan.md and phase files predate the review', () => {
      const dir = makeFeature({ [reviewFile]: review({ verdict: 'pass', generated_at: GENERATED }), 'phase-01-sample.md': '# P\n' });
      touch(join(dir, 'plan.md'), -60);
      touch(join(dir, 'phase-01-sample.md'), -60);
      expect(summarize(dir, [row(1, 'done')]).latestFull?.stale).toBe(false);
    });

    it('is stale when plan.md changed after the review, whatever the verdict', () => {
      for (const verdict of ['pass', 'changes_requested', 'blocked']) {
        const dir = makeFeature({ [reviewFile]: review({ verdict, generated_at: GENERATED }) });
        touch(join(dir, 'plan.md'), 60);
        expect(summarize(dir).latestFull?.stale).toBe(true);
      }
    });

    it('is stale when a root-level phase file changed after the review', () => {
      const dir = makeFeature({ [reviewFile]: review({ verdict: 'pass', generated_at: GENERATED }), 'phase-01-sample.md': '# P\n' });
      touch(join(dir, 'plan.md'), -60);
      touch(join(dir, 'phase-01-sample.md'), 60);
      expect(summarize(dir, [row(1, 'done')]).latestFull?.stale).toBe(true);
    });

    it('is stale when a phases/ phase file changed after the review', () => {
      const dir = makeFeature({ [reviewFile]: review({ verdict: 'pass', generated_at: GENERATED }), 'phases/phase-01-sample.md': '# P\n' });
      touch(join(dir, 'plan.md'), -60);
      touch(join(dir, 'phases/phase-01-sample.md'), 60);
      expect(summarize(dir, [row(1, 'done', 'phases/phase-01-sample.md')]).latestFull?.stale).toBe(true);
    });

    it('ignores a phase file that is not in the plan rows', () => {
      const dir = makeFeature({ [reviewFile]: review({ verdict: 'pass', generated_at: GENERATED }), 'phases/phase-09-extra.md': '# P\n' });
      touch(join(dir, 'plan.md'), -60);
      touch(join(dir, 'phases/phase-09-extra.md'), 60);
      expect(summarize(dir, []).latestFull?.stale).toBe(false);
    });

    describe('time source', () => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const stampName = (date: Date) =>
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

      it('trusts the file name stamp over a date-only generated_at that points earlier in the day', () => {
        const stampTime = new Date(2026, 9, 21, 14, 0, 0);
        const dir = makeFeature({ [`reviews/${stampName(stampTime)}-full.md`]: review({ verdict: 'pass', generated_at: '2026-10-21' }) });
        const planSeconds = stampTime.getTime() / 1000 - 3600;
        utimesSync(join(dir, 'plan.md'), planSeconds, planSeconds);
        expect(summarize(dir).latestFull?.stale).toBe(false);
      });

      it('trusts the file name stamp over a generated_at that claims a later time', () => {
        const stampTime = new Date(2026, 9, 21, 9, 0, 0);
        const claimed = new Date(stampTime.getTime() + 24 * 3600 * 1000).toISOString();
        const dir = makeFeature({ [`reviews/${stampName(stampTime)}-full.md`]: review({ verdict: 'pass', generated_at: claimed }) });
        const planSeconds = stampTime.getTime() / 1000 + 3600;
        utimesSync(join(dir, 'plan.md'), planSeconds, planSeconds);
        expect(summarize(dir).latestFull?.stale).toBe(true);
      });

      it('uses generated_at when the file name has no stamp', () => {
        const generated = Date.parse(GENERATED) / 1000;
        const fresh = makeFeature({ 'reviews/full-review.md': review({ verdict: 'pass', generated_at: GENERATED }) });
        utimesSync(join(fresh, 'plan.md'), generated - 60, generated - 60);
        expect(summarize(fresh).latestFull?.stale).toBe(false);

        const old = makeFeature({ 'reviews/full-review.md': review({ verdict: 'pass', generated_at: GENERATED }) });
        utimesSync(join(old, 'plan.md'), generated + 60, generated + 60);
        expect(summarize(old).latestFull?.stale).toBe(true);
      });

      it('is stale when neither the file name nor generated_at gives a usable time', () => {
        for (const generated_at of ['2026-13-45T99:00:00Z', '']) {
          const dir = makeFeature({ 'reviews/full-review.md': review({ verdict: 'pass', generated_at }) });
          utimesSync(join(dir, 'plan.md'), 1, 1);
          expect(summarize(dir).latestFull).toMatchObject({ verdict: 'pass', stale: true });
        }
      });

      it('still orders by generated_at while staleness follows the stamp', () => {
        const dir = makeFeature({
          'reviews/20261012-000000-a.md': review({ verdict: 'blocked', generated_at: '2026-10-10T09:00:00+07:00' }),
          'reviews/20261001-000000-b.md': review({ verdict: 'pass', generated_at: '2026-10-11T09:00:00+07:00' }),
        });
        expect(summarize(dir).latestFull?.verdict).toBe('pass');
      });
    });
  });
});

describe('written review report', () => {
  const seedLine = (text: string) => `/tdk-plan sample-001 "${text}"`;
  // The writer sanitizes the body; the collector then reads exactly what reached disk.
  const roundTrip = (body: string) => {
    const dir = makeFeature();
    const written = writeReviewReport(dir, dir, 'full-standard',
      review({ verdict: 'changes_requested', generated_at: '2026-10-10T09:00:00+07:00' }, body));
    if (!written.ok) throw new Error(`writer refused: ${written.error}`);
    return { written, summary: collectReviewSummary(dir, 'sample-001', []).latestFull };
  };

  it('keeps one bare seed readable as the Ready line', () => {
    const seed = seedLine('Fix the retry loop in the client');
    const { written, summary } = roundTrip(fixPhases(seed));
    expect(written.redactions).toBe(0);
    expect(summary).toMatchObject({ seedCount: 1, seedReady: seed });
  });

  it('counts a bare, a bullet and a backticked seed', () => {
    const body = fixPhases(
      seedLine('bare'),
      `- **Ready line**: \`${seedLine('bullet')}\``,
      `\`${seedLine('backticked')}\``,
    );
    const { written, summary } = roundTrip(body);
    expect(written.redactions).toBe(0);
    expect(summary).toMatchObject({ seedCount: 3, seedReady: null });
  });

  it('redacts a machine path inside a seed description and still parses the seed', () => {
    const { written, summary } = roundTrip(fixPhases(seedLine('fix /home/fake-person/x')));
    expect(written.redactions).toBe(1);
    expect(summary).toMatchObject({ seedCount: 1, seedReady: seedLine('fix [REDACTED:absolute-path]') });
  });

  it('redacts only the machine path in a body of slash commands, routes and locators', () => {
    const body = fixPhases(
      seedLine('first fix'),
      seedLine('second fix'),
      'Re-run `/tdk-review`, then `/tdk-status`, then `/tdk-archive`.',
      'GET /health',
      'skill: /backend-checks',
      'evidence: /home/fake/x',
    );
    const { written, summary } = roundTrip(body);
    expect(written.redactions).toBe(1);
    expect(readFileSync(written.path, 'utf-8')).toContain(body.replace('/home/fake/x', '[REDACTED:absolute-path]'));
    expect(summary).toMatchObject({ seedCount: 2, seedReady: null });
  });
});

describe('readMemoryStatus', () => {
  const closeOut = (value: string) => ({ 'close-out.md': `---\ntask_id: feature/sample-001\nmemory_status: ${value}\n---\n\n# Close-out\n` });

  it('returns each known status', () => {
    for (const status of ['pending', 'partial', 'ingested', 'skipped'] as const) {
      expect(readMemoryStatus(makeFeature(closeOut(status)))).toBe(status);
    }
  });

  it('returns null without close-out.md, without the key, or with an unknown value', () => {
    expect(readMemoryStatus(makeFeature())).toBeNull();
    expect(readMemoryStatus(makeFeature({ 'close-out.md': '---\ntask_id: x\n---\n' }))).toBeNull();
    expect(readMemoryStatus(makeFeature(closeOut('mystery')))).toBeNull();
  });

  it('returns null for malformed frontmatter instead of throwing', () => {
    expect(readMemoryStatus(makeFeature({ 'close-out.md': '---\nmemory_status: [unclosed\n---\n' }))).toBeNull();
  });
});
