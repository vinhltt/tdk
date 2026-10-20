// Feature-level lifecycle status shared by `tdk-status` and `plan-status-validator`.
//
// Post-plan values come from the same `derivePlanRootStatus` the write path uses, so a read can
// never disagree with what the next write would store. Pre-plan values come from the live
// specification quality gate (same verdict and legacy checklist fallback as `tdk-plan`), because the
// stored spec status is only a projection and legacy specs still carry the template `Draft`.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PhaseRow } from '../util/phases-table-parser';
import {
  derivePlanRootStatus, normalizeLifecycleStatus, readFrontmatterStatus, type LifecycleStatus,
} from '../util/plan-root-status';
import { validateSpecificationQualityGate } from '../util/specification-quality-gate';

export type FeatureStatus = 'empty' | LifecycleStatus;

/** Raw frontmatter `status:` values as stored on disk; null when the file or key is absent. */
export interface StoredStatuses {
  spec: string | null;
  plan: string | null;
}

export interface FeatureLifecycleInput {
  featureDir: string;
  /** spec.md content; null when the file does not exist. */
  specMd: string | null;
  /** plan.md content; null when the file does not exist. */
  planMd: string | null;
  phases: readonly PhaseRow[];
  /** plan.md has a single, parseable `## Phases` section. */
  phasesParseOk: boolean;
}

export interface StatusMismatchWarning {
  file: 'spec.md' | 'plan.md';
  level: 'status_mismatch';
  stored: string;
  derived: LifecycleStatus;
  message: string;
  fix: string;
}

export function readOptionalFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch { return null; }
}

export function readStoredStatuses(specMd: string | null, planMd: string | null): StoredStatuses {
  return {
    spec: specMd === null ? null : readFrontmatterStatus(specMd),
    plan: planMd === null ? null : readFrontmatterStatus(planMd),
  };
}

/** True when a stored value is outside the vocabulary or normalizes to something other than `derived`. */
export function isStoredStatusMismatch(
  raw: string | null,
  source: 'plan' | 'spec',
  derived: LifecycleStatus,
): boolean {
  if (raw === null) return false;
  const normalized = normalizeLifecycleStatus(raw, source);
  return normalized.unknown || normalized.status !== derived;
}

function normalizedOrNull(raw: string | null, source: 'plan' | 'spec'): LifecycleStatus | null {
  return raw === null ? null : normalizeLifecycleStatus(raw, source).status;
}

/** Live gate verdict: `ready` when plannable, else `draft`. Throws are contained as `draft` + warning. */
function derivePrePlanStatus(featureDir: string, specMd: string): { status: LifecycleStatus; warnings: string[] } {
  try {
    const verdict = validateSpecificationQualityGate(specMd, {
      legacyChecklistExists: existsSync(join(featureDir, 'checklists/requirements.md')),
    });
    return { status: verdict.allowed ? 'ready' : 'draft', warnings: [] };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 'draft', warnings: [`Specification quality gate could not be evaluated: ${reason}`] };
  }
}

export function deriveFeatureLifecycleStatus(
  input: FeatureLifecycleInput,
): { status: FeatureStatus; warnings: string[] } {
  const { featureDir, specMd, planMd, phases, phasesParseOk } = input;
  if (specMd === null) return { status: 'empty', warnings: [] };

  const stored = readStoredStatuses(specMd, planMd);
  const storedPlan = normalizedOrNull(stored.plan, 'plan');
  const storedSpec = normalizedOrNull(stored.spec, 'spec');

  // Archive is sticky and is written only by the archive command, so it wins over any derivation.
  if (storedPlan === 'archived' || storedSpec === 'archived') return { status: 'archived', warnings: [] };

  if (planMd === null) return derivePrePlanStatus(featureDir, specMd);

  if (!phasesParseOk) {
    return {
      status: storedSpec ?? 'draft',
      warnings: ['plan.md has no parseable `## Phases` table; feature_status falls back to the stored spec.md status'],
    };
  }
  return { status: derivePlanRootStatus(phases, storedPlan), warnings: [] };
}

/**
 * One warning per stored artifact status that disagrees with the derived value. Skipped when plan.md
 * exists but its phases are unparseable: there is nothing trustworthy to reconcile against.
 */
export function statusMismatchWarnings(args: {
  featureId: string;
  planPath: string;
  stored: StoredStatuses;
  derived: FeatureStatus;
  hasPlan: boolean;
  phasesParseOk: boolean;
}): StatusMismatchWarning[] {
  const { featureId, planPath, stored, derived, hasPlan, phasesParseOk } = args;
  if (derived === 'empty' || (hasPlan && !phasesParseOk)) return [];

  // /tdk-clarify only rewrites draft/ready, so a post-plan value left without a plan needs a hand edit.
  const prePlanStored = stored.spec !== null && ['draft', 'ready'].includes(normalizeLifecycleStatus(stored.spec, 'spec').status);
  const fix = hasPlan
    ? `(cd .specify/scripts/ts && bun src/commands/util/update-phase-status.ts --reconcile-root "${planPath}")`
    : prePlanStored ? `re-run /tdk-clarify ${featureId}` : `set spec.md status: to ${derived}`;
  const candidates: Array<{ file: 'spec.md' | 'plan.md'; raw: string | null; source: 'plan' | 'spec' }> = [
    { file: 'spec.md', raw: stored.spec, source: 'spec' },
    ...(hasPlan ? [{ file: 'plan.md' as const, raw: stored.plan, source: 'plan' as const }] : []),
  ];
  return candidates.flatMap(({ file, raw, source }) =>
    raw !== null && isStoredStatusMismatch(raw, source, derived)
      ? [{
          file,
          level: 'status_mismatch' as const,
          stored: raw,
          derived,
          message: `${file} status '${raw}' does not match derived feature_status '${derived}'`,
          fix,
        }]
      : []);
}
