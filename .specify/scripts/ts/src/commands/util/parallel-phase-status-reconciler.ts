import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { durableAtomicWriteFileSync } from './durable-atomic-file';
import { readPhaseFrontmatterStatus, renderPhaseFrontmatterStatus } from './phase-frontmatter';
import { parsePhasesTable, type PhaseStatus } from './phases-table-parser';
import {
  type LifecycleStatus, normalizeLifecycleStatus, readFrontmatterStatus, renderPlanStatuses, renderSpecLifecycleStatus,
} from './plan-root-status';

export interface StatusTransition { phase: number; from: PhaseStatus; to: PhaseStatus }
export interface TransitionInput {
  projectRoot: string; planPath: string; featureDir: string;
  transitions: StatusTransition[]; waveId?: string;
}

function context(projectRoot: string, planPath: string, featureDir: string): {
  plan: string; rows: ReturnType<typeof parsePhasesTable>['phases']; paths: Map<number, string>;
} {
  const rootRelative = relative(resolve(projectRoot), resolve(featureDir));
  if (rootRelative.startsWith('..') || isAbsolute(rootRelative) || resolve(planPath) !== resolve(featureDir, 'plan.md')) {
    throw new Error('status paths are outside the owned project/feature context');
  }
  const plan = readFileSync(planPath, 'utf8');
  const parsed = parsePhasesTable(plan);
  if (parsed.errors.length) throw new Error(parsed.errors.map((item) => item.message).join('; '));
  const paths = new Map(parsed.phases.map((row) => {
    const path = resolve(featureDir, row.file);
    const pathRelative = relative(resolve(featureDir), path);
    if (!pathRelative || pathRelative.startsWith('..') || isAbsolute(pathRelative)) {
      throw new Error(`phase ${row.number} path escapes the owned feature directory`);
    }
    return [row.number, path] as const;
  }));
  return { plan, rows: parsed.phases, paths };
}

export function inspectParallelPhaseStatuses(projectRoot: string, planPath: string, featureDir: string): {
  rows: Array<{ phase: number; planStatus: PhaseStatus; frontmatterStatus: PhaseStatus | null }>;
  mismatches: number[]; stale: number[];
} {
  const data = context(projectRoot, planPath, featureDir);
  const rows = data.rows.map((row) => ({ phase: row.number, planStatus: row.status,
    frontmatterStatus: readPhaseFrontmatterStatus(readFileSync(data.paths.get(row.number)!, 'utf8'), data.paths.get(row.number)!),
  }));
  return { rows, mismatches: rows.filter((row) => row.planStatus !== row.frontmatterStatus).map((row) => row.phase),
    stale: rows.filter((row) => row.planStatus === 'in_progress').map((row) => row.phase) };
}

function requireTransitions(input: TransitionInput, data: ReturnType<typeof context>): void {
  if (input.waveId) {
    if (input.transitions.length < 1 || input.transitions.length > 4) throw new Error('wave transition requires one to four phases');
    if (input.transitions.some(({ from, to }) => from !== 'in_progress' || to !== 'done')) {
      throw new Error('wave transition requires in_progress to done for every phase');
    }
  } else if (input.transitions.length !== 1) throw new Error('single transition requires exactly one phase');
  const numbers = input.transitions.map(({ phase }) => phase);
  if (numbers.some((value, index) => index > 0 && numbers[index - 1]! >= value)) throw new Error('phases must be unique and sorted');
  for (const item of input.transitions) {
    const row = data.rows.find(({ number }) => number === item.phase);
    const path = data.paths.get(item.phase);
    if (!row || !path || row.status !== item.from
      || readPhaseFrontmatterStatus(readFileSync(path, 'utf8'), path) !== item.from) throw new Error(`phase ${item.phase} status drift`);
  }
}

export interface TransitionResult { status: LifecycleStatus; changed: boolean; warnings: string[] }

/**
 * Spec mirror joins the transaction only when the plan root status changes, so the
 * common mid-wave write keeps its original plan + phase file set.
 */
function specPayload(featureDir: string, status: LifecycleStatus, warnings: string[]): {
  path: string; before: string; after: string;
} | null {
  const path = resolve(featureDir, 'spec.md');
  if (!existsSync(path)) { warnings.push(`spec.md not found in ${featureDir}; spec status not mirrored`); return null; }
  const before = readFileSync(path, 'utf8');
  const { specMd, hasStatusKey } = renderSpecLifecycleStatus(before, status);
  if (!hasStatusKey) { warnings.push(`${path} has no frontmatter status: key; spec status not mirrored`); return null; }
  return specMd === before ? null : { path, before, after: specMd };
}

function requireNotArchived(plan: string): void {
  const storedRoot = readFrontmatterStatus(plan);
  if (storedRoot !== null && normalizeLifecycleStatus(storedRoot, 'plan').status === 'archived') {
    throw new Error('plan is archived');
  }
}

export function transitionParallelPhaseStatuses(input: TransitionInput): TransitionResult {
  const data = context(input.projectRoot, input.planPath, input.featureDir);
  requireNotArchived(data.plan);
  requireTransitions(input, data);
  const updates = new Map(input.transitions.map(({ phase, to }) => [phase, to]));
  const { planMd: planAfter, status, changed } = renderPlanStatuses(data.plan, updates);
  const warnings: string[] = [];
  const spec = changed ? specPayload(input.featureDir, status, warnings) : null;
  const payloads = input.transitions.map((item) => {
    const path = data.paths.get(item.phase)!; const before = readFileSync(path, 'utf8');
    return { item, path, before, after: renderPhaseFrontmatterStatus(before, item.to, path) };
  });
  if (readFileSync(input.planPath, 'utf8') !== data.plan
    || payloads.some(({ path, before }) => readFileSync(path, 'utf8') !== before)
    || (spec && readFileSync(spec.path, 'utf8') !== spec.before)) {
    throw new Error('status bytes drifted before write');
  }
  durableAtomicWriteFileSync(input.planPath, planAfter);
  for (const payload of payloads) durableAtomicWriteFileSync(payload.path, payload.after);
  if (readFileSync(input.planPath, 'utf8') !== planAfter
    || payloads.some(({ path, after }) => readFileSync(path, 'utf8') !== after)
    || inspectParallelPhaseStatuses(input.projectRoot, input.planPath, input.featureDir).mismatches.length) {
    throw new Error('status verification failed');
  }
  if (spec) {
    const fix = `run (cd .specify/scripts/ts && bun src/commands/util/update-phase-status.ts --reconcile-root "${input.planPath}")`;
    try { durableAtomicWriteFileSync(spec.path, spec.after); } catch (error) {
      throw new Error(`spec status write failed (${error instanceof Error ? error.message : String(error)}); ${fix}`);
    }
    if (readFileSync(spec.path, 'utf8') !== spec.after) throw new Error(`spec status verification failed; ${fix}`);
  }
  return { status, changed, warnings };
}

export function reconcileParallelPhaseStatusesFromPlan(input: {
  projectRoot: string; planPath: string; featureDir: string;
}): { reconciled: number[] } {
  const data = context(input.projectRoot, input.planPath, input.featureDir); const reconciled: number[] = [];
  requireNotArchived(data.plan);
  for (const row of data.rows) {
    const path = data.paths.get(row.number)!; const before = readFileSync(path, 'utf8');
    if (readPhaseFrontmatterStatus(before, path) === row.status) continue;
    const after = renderPhaseFrontmatterStatus(before, row.status, path);
    if (readFileSync(input.planPath, 'utf8') !== data.plan || readFileSync(path, 'utf8') !== before)
      throw new Error(`status bytes drifted before reconciling phase ${row.number}`);
    durableAtomicWriteFileSync(path, after); reconciled.push(row.number);
  }
  if (inspectParallelPhaseStatuses(input.projectRoot, input.planPath, input.featureDir).mismatches.length) throw new Error('reconciliation verification failed');
  return { reconciled };
}
