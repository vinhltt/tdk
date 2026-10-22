// Read-only evidence for the tdk-status next-action ladder: does the feature have test evidence,
// which reviews exist and are they current, and what did close-out record for memory.
//
// This module owns all filesystem reads of that evidence and makes no recommendation. It never
// imports `status.ts` (that file runs the CLI on import) and never throws on malformed files:
// an unreadable or unrecognised artifact degrades to "no evidence" / `unknown`.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extractFrontmatter } from '../util/parse-plan-frontmatter';

export type TestMode = 'none' | 'tdd' | 'ut_backfill';

export interface PhaseRowLite {
  number: number;
  /** Relative to plan.md; a root-level `phase-NN-*.md` or `phases/phase-NN-*.md`. */
  file: string;
  phase_status: string;
}

export type TestEvidenceSource = 'plan_test_mode' | 'test_phase' | 'ut_artifact' | 'phase_test_file_ref';

export interface TestEvidence {
  strength: 'strong' | 'weak' | 'none';
  sources: TestEvidenceSource[];
  /** Phases carrying a test-shaped heading, whatever their status. */
  testPhases: { file: string; phase_status: string }[];
  /** Test-shaped phases marked `skipped`; they are not evidence. */
  skippedTestPhases: number;
}

export type ReviewVerdict = 'pass' | 'pass_with_concerns' | 'changes_requested' | 'blocked';

export interface ReviewRef {
  /** Feature-relative, e.g. `reviews/20261010-090507-full-standard.md`. */
  file: string;
  verdict: ReviewVerdict | 'unknown';
  /** `full` or `phase-NN`; empty when the report names no scope (never treated as full). */
  scope: string;
  generatedAt: string;
  /** Empty unless the verdict is `blocked`. */
  blockedReason: string;
  seedCount: number;
  /** The Ready line verbatim when exactly one seed was parsed. */
  seedReady: string | null;
  /** plan.md or a phase file changed after the review was generated. */
  stale: boolean;
}

export interface ReviewSummary {
  count: number;       // reports with a `verdict` in their frontmatter
  fullCount: number;
  latestFull: ReviewRef | null;
  latestAny: ReviewRef | null;
  /** `reviews/*.md` without a usable `verdict` (for example `analyze-report.md`). */
  ignored: string[];
}

export type MemoryStatus = 'pending' | 'partial' | 'ingested' | 'skipped' | null;

// Same heading set `tdk-retro-collect` Step 5 (plugins/tdk-retro/skills/tdk-retro-collect/SKILL.md)
// reads as test-mode phase evidence. It exists only in that prompt, so keep the two in step.
const TEST_SHAPED_HEADINGS = ['## Test Matrix', '## Tests Before', '## Tests After', '## Regression Gate'];

// Artifacts written by the UT workflows, including the legacy paths `ut backfill` still writes.
const UT_ARTIFACTS = ['ut-spec.md', 'ut/plan.md', 'coverage-analysis.md', 'ut-plan.md', 'coverage-report.json'];

const TEST_PATH_REF = /\.(?:test|spec)\.\w+|_test\.\w+|(?:^|[\s`'"(/])tests\/\S/m;

const VERDICTS: ReadonlySet<string> = new Set<ReviewVerdict>(['pass', 'pass_with_concerns', 'changes_requested', 'blocked']);
const MEMORY_STATUSES: ReadonlySet<string> = new Set(['pending', 'partial', 'ingested', 'skipped']);
const REVIEW_NAME_STAMP = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/;
const SEEDS_HEADING = '## Proposed Fix Phases';
function readText(path: string): string | null {
  try { return readFileSync(path, 'utf-8'); } catch { return null; }
}

function hasTestShapedHeading(body: string): boolean {
  return body.split('\n').some(line => TEST_SHAPED_HEADINGS.some(heading => line.startsWith(heading)));
}

export function collectTestEvidence(featureDir: string, testMode: TestMode, rows: PhaseRowLite[]): TestEvidence {
  const sources: TestEvidenceSource[] = [];
  const testPhases: TestEvidence['testPhases'] = [];
  let skippedTestPhases = 0;
  let weakRef = false;

  if (testMode !== 'none') sources.push('plan_test_mode');

  let hasTestPhase = false;
  for (const row of rows) {
    const body = readText(join(featureDir, row.file));
    if (body === null) continue;
    if (hasTestShapedHeading(body)) {
      testPhases.push({ file: row.file, phase_status: row.phase_status });
      if (row.phase_status === 'done') hasTestPhase = true;
      if (row.phase_status === 'skipped') skippedTestPhases++;
    } else if (row.phase_status === 'done' && TEST_PATH_REF.test(body)) {
      weakRef = true;
    }
  }
  if (hasTestPhase) sources.push('test_phase');
  if (UT_ARTIFACTS.some(artifact => existsSync(join(featureDir, artifact)))) sources.push('ut_artifact');

  if (sources.length > 0) return { strength: 'strong', sources, testPhases, skippedTestPhases };
  if (weakRef) return { strength: 'weak', sources: ['phase_test_file_ref'], testPhases, skippedTestPhases };
  return { strength: 'none', sources, testPhases, skippedTestPhases };
}

/** Newest mtime of plan.md and every phase file, in ms; 0 when none can be read. */
function newestPlanInputMtime(featureDir: string, rows: PhaseRowLite[]): number {
  let newest = 0;
  for (const file of ['plan.md', ...rows.map(row => row.file)]) {
    try { newest = Math.max(newest, statSync(join(featureDir, file)).mtimeMs); } catch { /* missing phase file */ }
  }
  return newest;
}

/** Epoch ms of the `YYYYMMDD-HHMMSS-` file name prefix (local time); NaN when the name has no stamp. */
function stampEpoch(name: string): number {
  const m = REVIEW_NAME_STAMP.exec(name);
  if (!m) return Number.NaN;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

/**
 * Two clocks, on purpose. The review helper stamps the file name from the system clock, while
 * `generated_at` is text the agent wrote (date only, or the wrong offset), so staleness trusts the
 * stamp first. Ordering keeps `generated_at` first, then the stamp. NaN means "no usable time".
 */
function reviewEpochs(generatedAt: string, name: string): { sortEpoch: number; staleEpoch: number } {
  const stamp = stampEpoch(name);
  const written = Date.parse(generatedAt);
  return {
    sortEpoch: Number.isNaN(written) ? stamp : written,
    staleEpoch: Number.isNaN(stamp) ? written : stamp,
  };
}

/** Ready lines under `## Proposed Fix Phases`: `/tdk-plan <id> "<description>"`, bare or inside a bullet/backticks; `None.` yields none. */
function parseSeeds(content: string, taskId: string): string[] {
  const start = content.indexOf(SEEDS_HEADING);
  if (start === -1) return [];
  const afterHeading = content.slice(start + SEEDS_HEADING.length);
  const next = afterHeading.search(/^## /m);
  const section = next === -1 ? afterHeading : afterHeading.slice(0, next);
  const prefix = `/tdk-plan ${taskId} "`;
  return section.split('\n')
    .map(text => text.indexOf(prefix) === -1 ? '' : text.slice(text.indexOf(prefix)).trim().replace(/`+$/, '').trim())
    .filter(command => command.endsWith('"'));
}

function asText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : '';
}

export function collectReviewSummary(featureDir: string, taskId: string, rows: PhaseRowLite[]): ReviewSummary {
  const reviewsDir = join(featureDir, 'reviews');
  let names: string[] = [];
  try {
    names = readdirSync(reviewsDir).filter(name => name.endsWith('.md'));
  } catch { /* no reviews directory */ }

  const planMtime = newestPlanInputMtime(featureDir, rows);
  const refs: { ref: ReviewRef; epoch: number }[] = [];
  const ignored: string[] = [];

  for (const name of names) {
    const path = join(reviewsDir, name);
    const file = `reviews/${name}`;
    const frontmatter = extractFrontmatter(path, taskId)?.parsed;
    const verdictText = asText(frontmatter?.['verdict']);
    if (frontmatter === undefined || verdictText === '') { ignored.push(file); continue; }

    const verdict = VERDICTS.has(verdictText) ? verdictText as ReviewVerdict : 'unknown';
    const generatedAt = asText(frontmatter['generated_at']);
    const { sortEpoch, staleEpoch } = reviewEpochs(generatedAt, name);
    const seeds = parseSeeds(readText(path) ?? '', asText(frontmatter['task_id']) || taskId);
    refs.push({
      epoch: sortEpoch,
      ref: {
        file,
        verdict,
        scope: asText(frontmatter['scope']),
        generatedAt,
        blockedReason: verdict === 'blocked' ? asText(frontmatter['blocked_reason']) : '',
        seedCount: seeds.length,
        seedReady: seeds.length === 1 ? seeds[0] ?? null : null,
        // No usable review time is treated as stale: re-review rather than archive on unknown evidence.
        stale: Number.isNaN(staleEpoch) || planMtime > staleEpoch,
      },
    });
  }

  // Oldest first; a report with no usable time sorts first, filename breaks ties.
  refs.sort((a, b) => (Number.isNaN(a.epoch) ? 0 : a.epoch) - (Number.isNaN(b.epoch) ? 0 : b.epoch)
    || a.ref.file.localeCompare(b.ref.file));
  const ordered = refs.map(entry => entry.ref);
  const full = ordered.filter(ref => ref.scope === 'full');

  return {
    count: ordered.length,
    fullCount: full.length,
    latestFull: full.at(-1) ?? null,
    latestAny: ordered.at(-1) ?? null,
    ignored: ignored.sort(),
  };
}

export function readMemoryStatus(featureDir: string): MemoryStatus {
  const value = asText(extractFrontmatter(join(featureDir, 'close-out.md'), '')?.parsed['memory_status']);
  return MEMORY_STATUSES.has(value) ? value as MemoryStatus : null;
}
