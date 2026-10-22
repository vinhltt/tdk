import { describe, expect, it } from 'bun:test';
import {
  archivedRecommendation, recommendNextAction, type NextActionInput,
} from '../src/commands/feature/next-action-recommendation';
import type {
  PhaseRowLite, ReviewRef, ReviewSummary, TestEvidence,
} from '../src/commands/feature/next-action-evidence';

const ID = 'sample-001';
const ARCHIVED_ID = 'feature/sample-009';

const row = (number: number, phase_status: string): PhaseRowLite =>
  ({ number, phase_status, file: `phase-${String(number).padStart(2, '0')}-sample.md` });

const STRONG: TestEvidence = { strength: 'strong', sources: ['plan_test_mode'], testPhases: [], skippedTestPhases: 0 };
const WEAK: TestEvidence = { strength: 'weak', sources: ['phase_test_file_ref'], testPhases: [], skippedTestPhases: 0 };
const NONE: TestEvidence = { strength: 'none', sources: [], testPhases: [], skippedTestPhases: 0 };

const ref = (over: Partial<ReviewRef> = {}): ReviewRef => ({
  file: 'reviews/20261019-090000-full-standard.md', verdict: 'pass', scope: 'full',
  generatedAt: '2026-10-19T09:00:00+07:00', blockedReason: '', seedCount: 0, seedReady: null, stale: false, ...over,
});

const reviews = (latestFull: ReviewRef | null, over: Partial<ReviewSummary> = {}): ReviewSummary => ({
  count: latestFull ? 1 : 0, fullCount: latestFull ? 1 : 0, latestFull, latestAny: latestFull, ignored: [], ...over,
});

const NO_REVIEWS = reviews(null);

function input(over: Partial<NextActionInput> = {}): NextActionInput {
  return {
    taskId: ID, feature_status: 'done', archived: false,
    phases: { rows: [row(1, 'done')], currentPhase: '', nextPhase: '', percent: 100 },
    testEvidence: STRONG, reviews: NO_REVIEWS, retro_status: 'none', memoryStatus: null, gitUncommitted: 0,
    ...over,
  };
}

const withRows = (rows: PhaseRowLite[], over: Partial<NextActionInput> = {}): NextActionInput => {
  const first = (status: string) => rows.find(r => r.phase_status === status)?.file ?? '';
  return input({
    feature_status: 'in_progress',
    phases: { rows, currentPhase: first('in_progress'), nextPhase: first('todo'), percent: 50 },
    ...over,
  });
};

const archived = (over: Partial<NextActionInput> = {}): NextActionInput =>
  input({ taskId: ARCHIVED_ID, feature_status: 'archived', archived: true, ...over });

const seedLine = (text: string) => `/tdk-plan ${ID} "${text}"`;

describe('pre-plan rule', () => {
  it('empty: specify', () => {
    const r = recommendNextAction(input({ feature_status: 'empty' }));
    expect(r).toEqual({ rule: 'pre-plan', primary: { command: `/tdk-specify ${ID}`, reason: 'No artifacts yet, start with specification' } });
  });

  it('draft: clarify', () => {
    const r = recommendNextAction(input({ feature_status: 'draft' }));
    expect(r.rule).toBe('pre-plan');
    expect(r.primary).toEqual({ command: `/tdk-clarify ${ID}`, reason: 'Spec not ready, resolve quality gate issues' });
  });

  it('ready: plan, with a TDD alternative', () => {
    const r = recommendNextAction(input({ feature_status: 'ready' }));
    expect(r.primary).toEqual({ command: `/tdk-plan ${ID}`, reason: 'Spec ready, create implementation plan' });
    expect(r.alternative).toEqual({ command: `/tdk-plan ${ID} --tdd`, reason: 'TDD: write tests first' });
  });
});

describe('implement rules', () => {
  it('impl-none: blocked status re-plans', () => {
    const r = recommendNextAction(withRows([row(1, 'done'), row(2, 'blocked')], { feature_status: 'blocked' }));
    expect(r.rule).toBe('impl-none');
    expect(r.primary).toEqual({ command: `/tdk-plan ${ID}`, reason: 'Phases blocked — re-evaluate dependencies in plan' });
    expect(r.alternative).toBeUndefined();
  });

  it('impl-none: in_progress with only blocked rows left re-plans, never implements', () => {
    const r = recommendNextAction(withRows([row(1, 'done'), row(2, 'blocked')]));
    expect(r.rule).toBe('impl-none');
    expect(r.primary.command).toBe(`/tdk-plan ${ID}`);
    expect(r.primary.reason).toContain('remaining phases blocked');
  });

  it('impl-none: planned with no runnable phase re-plans', () => {
    const r = recommendNextAction(withRows([], { feature_status: 'planned' }));
    expect(r.rule).toBe('impl-none');
    expect(r.primary.command).toBe(`/tdk-plan ${ID}`);
  });

  it('impl-all: several runnable phases implement all, with a --phase alternative for the next todo', () => {
    const r = recommendNextAction(withRows([row(1, 'done'), row(2, 'todo'), row(3, 'todo')]));
    expect(r.rule).toBe('impl-all');
    expect(r.primary).toEqual({ command: `/tdk-implement ${ID}`, reason: '50% done, 2 phases remaining' });
    expect(r.alternative).toEqual({ command: `/tdk-implement ${ID} --phase 02`, reason: 'Run only phase 02' });
  });

  it('impl-all: planned counts every todo row', () => {
    const r = recommendNextAction(withRows([row(1, 'todo'), row(2, 'todo'), row(3, 'todo')], { feature_status: 'planned' }));
    expect(r.rule).toBe('impl-all');
    expect(r.primary.reason).toContain('3 phases remaining');
  });

  it('impl-all: an in_progress phase gets resume wording and the alternative targets the next todo', () => {
    const r = recommendNextAction(withRows([row(1, 'done'), row(2, 'in_progress'), row(3, 'todo')]));
    expect(r.rule).toBe('impl-all');
    expect(r.primary.reason).toBe('resume phase 02 (in_progress), 2 phases remaining');
    expect(r.alternative?.command).toBe(`/tdk-implement ${ID} --phase 03`);
  });

  it('impl-all: with no todo row the alternative targets the in_progress phase', () => {
    const r = recommendNextAction(withRows([row(1, 'in_progress'), row(2, 'in_progress')]));
    expect(r.alternative?.command).toBe(`/tdk-implement ${ID} --phase 01`);
  });

  it('impl-all: drops the --phase alternative when nextPhase is not among the rows', () => {
    const base = withRows([row(1, 'todo'), row(2, 'todo')]);
    const r = recommendNextAction({ ...base, phases: { ...base.phases, nextPhase: 'phases/phase-99-missing.md', currentPhase: '' } });
    expect(r.rule).toBe('impl-all');
    expect(r.primary.command).toBe(`/tdk-implement ${ID}`);
    expect(r.alternative).toBeUndefined();
  });

  it('impl-next: one runnable todo phase implements that phase', () => {
    const r = recommendNextAction(withRows([row(1, 'done'), row(2, 'todo'), row(3, 'blocked')]));
    expect(r.rule).toBe('impl-next');
    expect(r.primary).toEqual({ command: `/tdk-implement ${ID} --phase 02`, reason: '50% done, next phase: phase-02-sample.md' });
    expect(r.alternative).toBeUndefined();
  });

  it('impl-next: one in_progress phase resumes', () => {
    const r = recommendNextAction(withRows([row(1, 'done'), row(2, 'in_progress')]));
    expect(r.rule).toBe('impl-next');
    expect(r.primary).toEqual({ command: `/tdk-implement ${ID} --phase 02`, reason: 'resume phase 02 (in_progress)' });
  });
});

describe('cancelled rule', () => {
  it('archives a cancelled feature', () => {
    const r = recommendNextAction(input({ feature_status: 'cancelled', testEvidence: NONE }));
    expect(r).toEqual({ rule: 'cancelled', primary: { command: `/tdk-archive ${ID}`, reason: 'All phases cancelled, archive the feature' } });
  });
});

describe('done rules', () => {
  it('ut-missing: backfill first, review second', () => {
    const r = recommendNextAction(input({ testEvidence: NONE }));
    expect(r.rule).toBe('ut-missing');
    expect(r.primary).toEqual({ command: `/tdk-plan ${ID} --ut-backfill`, reason: 'Implementation done, add tests' });
    expect(r.alternative?.command).toBe(`/tdk-review ${ID}`);
  });

  it('ut-missing: names the skipped test phases', () => {
    const r = recommendNextAction(input({ testEvidence: { ...NONE, skippedTestPhases: 2 } }));
    expect(r.primary.reason).toBe('Implementation done, add tests (2 test phase(s) skipped)');
  });

  it('review-missing: no review at all', () => {
    const r = recommendNextAction(input());
    expect(r.rule).toBe('review-missing');
    expect(r.primary).toEqual({ command: `/tdk-review ${ID}`, reason: 'All phases done, no review yet' });
    expect(r.alternative).toBeUndefined();
  });

  it('review-missing: only phase-scoped reviews exist', () => {
    const phaseOnly = reviews(null, { count: 2, fullCount: 0, latestAny: ref({ scope: 'phase-02' }) });
    expect(recommendNextAction(input({ reviews: phaseOnly })).primary.reason).toBe('only phase-scoped reviews (2)');
  });

  it('review-missing: weak evidence explains itself and offers the backfill', () => {
    const r = recommendNextAction(input({ testEvidence: WEAK }));
    expect(r.rule).toBe('review-missing');
    expect(r.primary.command).toBe(`/tdk-review ${ID}`);
    expect(r.primary.reason).toContain('tests referenced but no test matrix');
    expect(r.alternative?.command).toBe(`/tdk-plan ${ID} --ut-backfill`);
  });

  it('review-blocked: reason follows blocked_reason', () => {
    const cases: Array<[string, string]> = [
      ['working_tree_changed', 'commit or stash then re-review'],
      ['all_reviewers_failed', 'all reviewers failed, re-review'],
      ['empty_scope', 'check the base commit'],
      ['', 'no reason recorded'],
    ];
    for (const [blockedReason, text] of cases) {
      const r = recommendNextAction(input({ reviews: reviews(ref({ verdict: 'blocked', blockedReason })) }));
      expect(r.rule).toBe('review-blocked');
      expect(r.primary.command).toBe(`/tdk-review ${ID}`);
      expect(r.primary.reason).toContain(text);
    }
  });

  it('review-unknown: re-review', () => {
    const r = recommendNextAction(input({ reviews: reviews(ref({ verdict: 'unknown' })) }));
    expect(r.rule).toBe('review-unknown');
    expect(r.primary.command).toBe(`/tdk-review ${ID}`);
  });

  it('review-stale: names the review date', () => {
    const r = recommendNextAction(input({ reviews: reviews(ref({ stale: true })) }));
    expect(r.rule).toBe('review-stale');
    expect(r.primary).toEqual({ command: `/tdk-review ${ID}`, reason: 'plan changed after review 2026-10-19' });
  });

  it('review-changes: one seed is the Ready line verbatim', () => {
    const line = seedLine('Fix the retry loop');
    const r = recommendNextAction(input({ reviews: reviews(ref({ verdict: 'changes_requested', seedCount: 1, seedReady: line })) }));
    expect(r.rule).toBe('review-changes');
    expect(r.primary.command).toBe(line);
    expect(r.alternative?.command).toBe(`/tdk-review ${ID}`);
  });

  it('review-changes: several seeds append each', () => {
    const r = recommendNextAction(input({ reviews: reviews(ref({ verdict: 'changes_requested', seedCount: 3 })) }));
    expect(r.primary).toEqual({ command: `/tdk-plan ${ID}`, reason: '3 fix seeds in reviews/20261019-090000-full-standard.md; Append each' });
  });

  it('review-changes: no parsed seed points at the report', () => {
    const r = recommendNextAction(input({ reviews: reviews(ref({ verdict: 'changes_requested' })) }));
    expect(r.primary.command).toBe(`/tdk-plan ${ID}`);
    expect(r.primary.reason).toContain('reviews/20261019-090000-full-standard.md');
  });

  it('archive-ready: pass archives, and reports the full review count and latest verdict', () => {
    const r = recommendNextAction(input({
      reviews: reviews(ref(), { count: 3, fullCount: 2, latestAny: ref({ scope: 'phase-01' }) }),
    }));
    expect(r.rule).toBe('archive-ready');
    expect(r.primary).toEqual({ command: `/tdk-archive ${ID}`, reason: 'Reviewed 2× (latest: pass, 2026-10-19)' });
    expect(r.alternative).toBeUndefined();
  });

  it('archive-ready: pass_with_concerns without seeds has no alternative', () => {
    const r = recommendNextAction(input({ reviews: reviews(ref({ verdict: 'pass_with_concerns' })) }));
    expect(r.rule).toBe('archive-ready');
    expect(r.primary.reason).toBe('Reviewed 1× (latest: pass_with_concerns, 2026-10-19)');
    expect(r.alternative).toBeUndefined();
  });

  it('archive-ready: pass_with_concerns with one seed offers that seed', () => {
    const line = seedLine('Tighten input validation');
    const r = recommendNextAction(input({ reviews: reviews(ref({ verdict: 'pass_with_concerns', seedCount: 1, seedReady: line })) }));
    expect(r.alternative).toEqual({ command: line, reason: '1 unapplied fix seed' });
  });

  it('archive-ready: pass_with_concerns with several seeds offers the generic Append form', () => {
    const r = recommendNextAction(input({ reviews: reviews(ref({ verdict: 'pass_with_concerns', seedCount: 2 })) }));
    expect(r.alternative).toEqual({ command: `/tdk-plan ${ID}`, reason: '2 unapplied fix seeds' });
  });

  it('archive-ready: a pass never offers seeds', () => {
    const r = recommendNextAction(input({ reviews: reviews(ref({ verdict: 'pass', seedCount: 2 })) }));
    expect(r.alternative).toBeUndefined();
  });

  it('archive-ready: appends the uncommitted hint only when files are uncommitted', () => {
    const clean = recommendNextAction(input({ reviews: reviews(ref()) }));
    expect(clean.primary.reason).not.toContain('uncommitted');

    const dirty = recommendNextAction(input({ reviews: reviews(ref()), gitUncommitted: 3 }));
    expect(dirty.primary.reason).toBe(
      'Reviewed 1× (latest: pass, 2026-10-19); 3 uncommitted file(s) under feature dir — commit them first, /tdk-archive blocks on uncommitted changes',
    );
  });

  it('done: never offers retro before archive', () => {
    const r = recommendNextAction(input({ reviews: reviews(ref()), retro_status: 'none' }));
    expect(r.alternative).toBeUndefined();
  });
});

describe('done precedence', () => {
  const stale = (over: Partial<ReviewRef>) => reviews(ref({ stale: true, ...over }));

  it('ut-missing beats review-missing and every review rule', () => {
    for (const r of [NO_REVIEWS, reviews(ref()), reviews(ref({ verdict: 'blocked' }))]) {
      expect(recommendNextAction(input({ testEvidence: NONE, reviews: r })).rule).toBe('ut-missing');
    }
  });

  it('blocked beats stale', () => {
    expect(recommendNextAction(input({ reviews: stale({ verdict: 'blocked' }) })).rule).toBe('review-blocked');
  });

  it('unknown beats stale', () => {
    expect(recommendNextAction(input({ reviews: stale({ verdict: 'unknown' }) })).rule).toBe('review-unknown');
  });

  it('stale beats changes_requested', () => {
    expect(recommendNextAction(input({ reviews: stale({ verdict: 'changes_requested', seedCount: 2 }) })).rule).toBe('review-stale');
  });

  it('a stale pass goes back to review, not to archive', () => {
    for (const verdict of ['pass', 'pass_with_concerns'] as const) {
      const r = recommendNextAction(input({ reviews: stale({ verdict }) }));
      expect(r.rule).toBe('review-stale');
      expect(r.primary.command).toBe(`/tdk-review ${ID}`);
    }
  });

  it('weak evidence still reaches review, never skips it', () => {
    expect(recommendNextAction(input({ testEvidence: WEAK, reviews: reviews(ref()) })).rule).toBe('archive-ready');
    expect(recommendNextAction(input({ testEvidence: WEAK })).rule).toBe('review-missing');
  });

  it('cancelled never reaches the test or review ladder', () => {
    expect(recommendNextAction(input({ feature_status: 'cancelled', testEvidence: NONE, reviews: stale({}) })).rule).toBe('cancelled');
  });
});

describe('archived rules', () => {
  const retro = (retro_status: NextActionInput['retro_status'], over: Partial<NextActionInput> = {}) =>
    recommendNextAction(archived({ retro_status, ...over }));

  it('archived-retro: walks collect, propose, apply with the canonical id', () => {
    expect(retro('none').primary.command).toBe(`/tdk-retro-collect ${ARCHIVED_ID}`);
    expect(retro('collected').primary.command).toBe(`/tdk-retro-propose ${ARCHIVED_ID}`);
    expect(retro('proposed').primary.command).toBe(`/tdk-retro-apply ${ARCHIVED_ID}`);
    for (const status of ['none', 'collected', 'proposed'] as const) expect(retro(status).rule).toBe('archived-retro');
  });

  it('archived-retro: keeps the retro reasons', () => {
    expect(retro('none').primary.reason).toBe('Feature archived, no retro feedback collected yet');
    expect(retro('collected').primary.reason).toBe('Feature archived, retro feedback collected, propose learning changes');
    expect(retro('proposed').primary.reason).toBe('Feature archived, learning changes awaiting review');
  });

  it('archived-retro: offers ingest as the alternative only while memory rows wait', () => {
    for (const memoryStatus of ['pending', 'partial'] as const) {
      expect(retro('collected', { memoryStatus }).alternative).toEqual({
        command: `/tdk-archive --ingest ${ARCHIVED_ID}`,
        reason: 'memory rows waiting; ingest after retro, or now if retro is deferred',
      });
    }
    for (const memoryStatus of ['ingested', 'skipped', null] as const) {
      expect(retro('collected', { memoryStatus }).alternative).toBeUndefined();
    }
  });

  it('archived-memory: retro done with memory rows waiting ingests', () => {
    for (const memoryStatus of ['pending', 'partial'] as const) {
      const r = retro('done', { memoryStatus });
      expect(r.rule).toBe('archived-memory');
      expect(r.primary).toEqual({
        command: `/tdk-archive --ingest ${ARCHIVED_ID}`,
        reason: `retro complete, memory rows not ingested (memory_status: ${memoryStatus})`,
      });
      expect(r.alternative).toBeUndefined();
    }
  });

  it('archived-complete: nothing left once memory is ingested, skipped, or absent', () => {
    for (const memoryStatus of ['ingested', 'skipped', null] as const) {
      const r = retro('done', { memoryStatus });
      expect(r).toEqual({ rule: 'archived-complete', primary: { command: '', reason: 'Feature archived, retro and memory complete' } });
    }
  });

  it('archived beats every other rule', () => {
    const r = recommendNextAction(archived({ feature_status: 'empty', testEvidence: NONE }));
    expect(r.rule).toBe('archived-retro');
  });

  it('a stored archived status counts even when the directory has not moved', () => {
    const r = recommendNextAction(input({ feature_status: 'archived', archived: false, retro_status: 'none' }));
    expect(r.rule).toBe('archived-retro');
  });

  it('archivedRecommendation is exhaustive over retro status', () => {
    expect(archivedRecommendation(ARCHIVED_ID, 'done')).toEqual({ command: '', reason: 'Feature archived, retro and memory complete' });
  });
});
