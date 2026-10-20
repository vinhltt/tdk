/**
 * plan-root-status.ts
 *
 * Feature lifecycle shared by `spec.md` status and `plan.md` root status.
 * Pre-plan values (`draft`/`ready`) are prompt-owned; post-plan values are
 * derived from `## Phases` rows here; `archived` is written only by the
 * feature archive command and is sticky.
 *
 * `renderPlanStatuses` is the single write choke point for phase-row status
 * changes: it is the only `src/` caller of `renderPhaseStatuses` (contract test).
 */

import { readFrontmatterBlock, replaceFrontmatterStatusLine } from './phase-frontmatter';
import { parsePhasesTable, renderPhaseStatuses, type PhaseRow, type PhaseStatus } from './phases-table-parser';

export type LifecycleStatus =
  | 'draft' | 'ready' | 'planned' | 'in_progress' | 'blocked' | 'done' | 'cancelled' | 'archived';

export const LIFECYCLE_STATUSES: readonly LifecycleStatus[] = [
  'draft', 'ready', 'planned', 'in_progress', 'blocked', 'done', 'cancelled', 'archived',
];

const LIFECYCLE_SET: ReadonlySet<string> = new Set(LIFECYCLE_STATUSES);

/** Plan root values written before the lifecycle existed. */
const PLAN_ROOT_ALIASES: Readonly<Record<string, LifecycleStatus>> = {
  todo: 'planned',
  skipped: 'cancelled',
};

export interface NormalizedLifecycleStatus {
  status: LifecycleStatus;
  /** Raw value is not byte-identical to the canonical value (case, quotes, alias). */
  legacy: boolean;
  /** Raw value is outside the vocabulary; `status` falls back to `draft`. */
  unknown: boolean;
}

export function normalizeLifecycleStatus(raw: string, source: 'plan' | 'spec'): NormalizedLifecycleStatus {
  const value = raw.trim().replace(/^(["'])(.*)\1$/, '$2').trim().toLowerCase();
  const status = LIFECYCLE_SET.has(value)
    ? value as LifecycleStatus
    : source === 'plan' ? PLAN_ROOT_ALIASES[value] : undefined;
  if (!status) return { status: 'draft', legacy: true, unknown: true };
  return { status, legacy: raw !== status, unknown: false };
}

const STATUS_VALUE_RE = /^status:[^\S\r\n]*([^\s#]\S*)/m;

/** Raw frontmatter `status:` value (inline comment excluded); null when absent. BOM/CRLF safe. */
export function readFrontmatterStatus(content: string): string | null {
  const block = readFrontmatterBlock(content);
  if (block === null) return null;
  return STATUS_VALUE_RE.exec(block)?.[1] ?? null;
}

/**
 * Post-plan lifecycle from phase rows, first match wins. `archived` is sticky.
 * Todo rows next to blocked spike dependents stay `planned`; `blocked` means no
 * actionable phase is left.
 */
export function derivePlanRootStatus(
  rows: readonly Pick<PhaseRow, 'status'>[],
  stored: LifecycleStatus | null,
): LifecycleStatus {
  if (stored === 'archived') return 'archived';
  if (rows.length === 0) return 'planned';
  const has = (status: PhaseStatus) => rows.some((row) => row.status === status);
  const all = (set: readonly PhaseStatus[]) => rows.every((row) => set.includes(row.status));
  if (has('in_progress')) return 'in_progress';
  if (all(['done', 'skipped', 'cancelled']) && has('done')) return 'done';
  if (all(['skipped', 'cancelled'])) return 'cancelled';
  if (has('done') && (has('todo') || has('blocked'))) return 'in_progress';
  if (!has('todo') && has('blocked')) return 'blocked';
  return 'planned';
}

export interface RenderPlanStatusesResult {
  planMd: string;
  status: LifecycleStatus;
  /** Root `status:` line was rewritten (value change or legacy spelling). */
  changed: boolean;
}

/**
 * Apply phase-row status updates, then recompute the plan root status.
 * An empty `updates` map leaves the table bytes untouched (root reconcile only).
 * Throws on any `## Phases` parse error so a partial table never drives the root.
 */
export function renderPlanStatuses(
  md: string,
  updates: ReadonlyMap<number, PhaseStatus>,
): RenderPlanStatusesResult {
  const rowsMd = updates.size > 0 ? renderPhaseStatuses(md, updates) : md;
  const parsed = parsePhasesTable(rowsMd);
  if (parsed.errors.length > 0) throw new Error(parsed.errors.map((error) => error.message).join('; '));

  const raw = readFrontmatterStatus(md);
  const stored = raw === null ? null : normalizeLifecycleStatus(raw, 'plan');
  const status = derivePlanRootStatus(parsed.phases, stored?.status ?? null);
  if (!stored || (stored.status === status && !stored.legacy)) {
    return { planMd: rowsMd, status, changed: false };
  }
  const planMd = replaceFrontmatterStatusLine(rowsMd, status);
  return { planMd, status, changed: planMd !== rowsMd };
}

/**
 * Mirror a lifecycle value into `spec.md` frontmatter. Never inserts a missing
 * key: `hasStatusKey: false` tells the caller to warn instead.
 */
export function renderSpecLifecycleStatus(
  specMd: string,
  status: LifecycleStatus,
): { specMd: string; hasStatusKey: boolean } {
  if (readFrontmatterStatus(specMd) === null) return { specMd, hasStatusKey: false };
  return { specMd: replaceFrontmatterStatusLine(specMd, status), hasStatusKey: true };
}
