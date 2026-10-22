// Ordered, pure next-action ladder for `tdk-status`: lifecycle implement -> test -> review ->
// archive -> retro -> memory update. First unmet step wins; the rule order is the contract.
//
// No I/O and no clock: everything arrives in `NextActionInput`, so each rule is testable on a
// plain object. Evidence is gathered by `next-action-evidence.ts`; this module only decides.

import type { FeatureStatus } from './feature-lifecycle-status';
import type { RetroStatus } from './feature-retro-status';
import type {
  MemoryStatus, PhaseRowLite, ReviewRef, ReviewSummary, TestEvidence,
} from './next-action-evidence';

export interface NextActionInput {
  /** Canonical task id: the bare id for active specs, `<folder>/<ticket>` for archived ones. */
  taskId: string;
  feature_status: FeatureStatus;
  archived: boolean;
  phases: { rows: PhaseRowLite[]; currentPhase: string; nextPhase: string; percent: number };
  testEvidence: TestEvidence;
  reviews: ReviewSummary;
  retro_status: RetroStatus;
  memoryStatus: MemoryStatus;
  /** Porcelain count under the feature dir; includes files `/tdk-archive` ignores, so hint only. */
  gitUncommitted: number;
}

export interface RecommendationLine { command: string; reason: string }
export interface Recommendation { primary: RecommendationLine; alternative?: RecommendationLine; rule: string }

/** Next retro step for an archived spec; an empty command means nothing is left to do. */
export function archivedRecommendation(taskId: string, retroStatus: RetroStatus): RecommendationLine {
  switch (retroStatus) {
    case 'none':
      return { command: `/tdk-retro-collect ${taskId}`, reason: 'Feature archived, no retro feedback collected yet' };
    case 'collected':
      return { command: `/tdk-retro-propose ${taskId}`, reason: 'Feature archived, retro feedback collected, propose learning changes' };
    case 'proposed':
      return { command: `/tdk-retro-apply ${taskId}`, reason: 'Feature archived, learning changes awaiting review' };
    case 'done':
      return { command: '', reason: 'Feature archived, retro and memory complete' };
  }
}

const nn = (row: PhaseRowLite): string => String(row.number).padStart(2, '0');
const reviewDate = (ref: ReviewRef): string => ref.generatedAt.slice(0, 10) || 'unknown date';
const line = (command: string, reason: string): RecommendationLine => ({ command, reason });
const rec = (rule: string, primary: RecommendationLine, alternative?: RecommendationLine): Recommendation =>
  ({ rule, primary, ...(alternative && { alternative }) });

function archivedRule({ taskId, retro_status, memoryStatus }: NextActionInput): Recommendation {
  const memoryWaiting = memoryStatus === 'pending' || memoryStatus === 'partial';
  const ingest = `/tdk-archive --ingest ${taskId}`;
  if (retro_status !== 'done') {
    const waiting = line(ingest, 'memory rows waiting; ingest after retro, or now if retro is deferred');
    return rec('archived-retro', archivedRecommendation(taskId, retro_status), memoryWaiting ? waiting : undefined);
  }
  if (memoryWaiting) {
    return rec('archived-memory', line(ingest, `retro complete, memory rows not ingested (memory_status: ${memoryStatus})`));
  }
  return rec('archived-complete', archivedRecommendation(taskId, 'done'));
}

function prePlanRule({ taskId, feature_status }: NextActionInput): Recommendation {
  if (feature_status === 'empty') return rec('pre-plan', line(`/tdk-specify ${taskId}`, 'No artifacts yet, start with specification'));
  if (feature_status === 'draft') return rec('pre-plan', line(`/tdk-clarify ${taskId}`, 'Spec not ready, resolve quality gate issues'));
  return rec('pre-plan', line(`/tdk-plan ${taskId}`, 'Spec ready, create implementation plan'), line(`/tdk-plan ${taskId} --tdd`, 'TDD: write tests first'));
}

function implementRule({ taskId, feature_status, phases }: NextActionInput): Recommendation {
  const runnable = phases.rows.filter(row => row.phase_status === 'todo' || row.phase_status === 'in_progress');
  const replan = (reason: string): Recommendation => rec('impl-none', line(`/tdk-plan ${taskId}`, reason));

  if (feature_status === 'blocked') return replan('Phases blocked — re-evaluate dependencies in plan');
  if (runnable.length === 0) {
    return replan(feature_status === 'in_progress'
      ? `${phases.percent}% done, remaining phases blocked — re-evaluate dependencies in plan`
      : 'Plan has no runnable phase — re-evaluate dependencies in plan');
  }
  if (runnable.length === 1) {
    const only = runnable[0]!;
    const reason = only.phase_status === 'in_progress' ? `resume phase ${nn(only)} (in_progress)` : `${phases.percent}% done, next phase: ${only.file}`;
    return rec('impl-next', line(`/tdk-implement ${taskId} --phase ${nn(only)}`, reason));
  }

  const current = phases.rows.find(row => row.file === phases.currentPhase);
  const remaining = `${runnable.length} phases remaining`;
  const reason = current ? `resume phase ${nn(current)} (in_progress), ${remaining}` : `${phases.percent}% done, ${remaining}`;
  const target = phases.rows.find(row => row.file === (phases.nextPhase || phases.currentPhase));
  // No matching row means no phase number to pass, so the alternative is omitted.
  const phaseOnly = target && line(`/tdk-implement ${taskId} --phase ${nn(target)}`, `Run only phase ${nn(target)}`);
  return rec('impl-all', line(`/tdk-implement ${taskId}`, reason), phaseOnly);
}

/** Fix-seed form: the single Ready line verbatim, a generic Append for several, the report path when none parsed. */
function seedLine(ref: ReviewRef, taskId: string): RecommendationLine {
  if (ref.seedCount === 1 && ref.seedReady !== null) {
    return line(ref.seedReady, `Review requested changes, apply the fix seed from ${ref.file}`);
  }
  if (ref.seedCount >= 2) return line(`/tdk-plan ${taskId}`, `${ref.seedCount} fix seeds in ${ref.file}; Append each`);
  return line(`/tdk-plan ${taskId}`, `Review requested changes but no fix seeds parsed, see ${ref.file}`);
}

const BLOCKED_HINTS: Record<string, string> = {
  working_tree_changed: 'working tree changed, commit or stash then re-review',
  all_reviewers_failed: 'all reviewers failed, re-review',
  empty_scope: 'empty scope, check the base commit then re-review',
};

const blockedReason = (ref: ReviewRef): string =>
  `Last full review blocked: ${BLOCKED_HINTS[ref.blockedReason] ?? `${ref.blockedReason || 'no reason recorded'}, re-review`}`;

function doneRule({ taskId, testEvidence, reviews, gitUncommitted }: NextActionInput): Recommendation {
  const review = (rule: string, reason: string, alternative?: RecommendationLine): Recommendation =>
    rec(rule, line(`/tdk-review ${taskId}`, reason), alternative);
  const backfill = `/tdk-plan ${taskId} --ut-backfill`;

  if (testEvidence.strength === 'none') {
    const skipped = testEvidence.skippedTestPhases;
    const reason = skipped > 0 ? `Implementation done, add tests (${skipped} test phase(s) skipped)` : 'Implementation done, add tests';
    return rec('ut-missing', line(backfill, reason), line(`/tdk-review ${taskId}`, 'Review without adding tests'));
  }

  const latest = reviews.latestFull;
  if (latest === null) {
    const weak = testEvidence.strength === 'weak';
    const reason = [
      reviews.count > 0 ? `only phase-scoped reviews (${reviews.count})` : 'All phases done, no review yet',
      ...(weak ? ['tests referenced but no test matrix'] : []),
    ].join('; ');
    return review('review-missing', reason, weak ? line(backfill, 'Add a test matrix') : undefined);
  }
  if (latest.verdict === 'blocked') return review('review-blocked', blockedReason(latest));
  if (latest.verdict === 'unknown') return review('review-unknown', `Latest full review verdict is not recognised (${latest.file}), re-review`);
  if (latest.stale) return review('review-stale', `plan changed after review ${reviewDate(latest)}`);
  if (latest.verdict === 'changes_requested') {
    return rec('review-changes', seedLine(latest, taskId), line(`/tdk-review ${taskId}`, 'Re-review after applying fixes'));
  }

  const hint = gitUncommitted > 0
    ? `; ${gitUncommitted} uncommitted file(s) under feature dir — commit them first, /tdk-archive blocks on uncommitted changes`
    : '';
  const seeds = latest.seedCount;
  const unapplied = latest.verdict === 'pass_with_concerns' && seeds >= 1
    ? line(seedLine(latest, taskId).command, `${seeds} unapplied fix seed${seeds === 1 ? '' : 's'}`)
    : undefined;
  const reason = `Reviewed ${reviews.fullCount}× (latest: ${latest.verdict}, ${reviewDate(latest)})${hint}`;
  return rec('archive-ready', line(`/tdk-archive ${taskId}`, reason), unapplied);
}

export function recommendNextAction(input: NextActionInput): Recommendation {
  // A stored `archived` status counts even when the directory has not moved, like the shipped switch.
  if (input.archived || input.feature_status === 'archived') return archivedRule(input);
  switch (input.feature_status) {
    case 'empty':
    case 'draft':
    case 'ready':
      return prePlanRule(input);
    case 'planned':
    case 'in_progress':
    case 'blocked':
      return implementRule(input);
    case 'cancelled':
      return rec('cancelled', line(`/tdk-archive ${input.taskId}`, 'All phases cancelled, archive the feature'));
    case 'done':
      return doneRule(input);
  }
}
