import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { assertParallelControllerOwner, writeParallelLeaseJson } from './parallel-controller-lease';
import { durableAtomicWriteFileSync, durableUnlinkSync } from './durable-atomic-file';
import {
  markControllerStatusMutation, settleControllerStatusMutation,
} from './parallel-controller-mutation-state';
import {
  parseParallelStatusJournal,
  validateParallelStatusJournalState,
  type ParallelSingleStatusJournal,
  type ParallelWaveStatusJournal,
} from './parallel-status-journal';
import { readPhaseFrontmatterStatus, renderPhaseFrontmatterStatus } from './phase-frontmatter';
import { parsePhasesTable, renderPhaseStatuses, type PhaseStatus } from './phases-table-parser';

export interface StatusTransition { phase: number; from: PhaseStatus; to: PhaseStatus }
export interface TransitionInput {
  projectRoot: string; planPath: string; featureDir: string; lockPath: string; controllerId: string;
  transitions: StatusTransition[]; waveId?: string; crashAt?: string;
}
const sha = (bytes: string): string => createHash('sha256').update(bytes).digest('hex');
const crash = (input: { crashAt?: string }, point: string): void => {
  if (input.crashAt === point) throw new Error(`injected crash at ${point}`);
};

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

export function transitionParallelPhaseStatuses(input: TransitionInput): void {
  const ownerContext = { projectRoot: input.projectRoot, featureDir: input.featureDir };
  assertParallelControllerOwner(input.lockPath, input.controllerId, ownerContext);
  const data = context(input.projectRoot, input.planPath, input.featureDir); requireTransitions(input, data);
  markControllerStatusMutation(input.lockPath, input.controllerId, ownerContext,
    input.transitions.map(({ phase }) => phase));
  crash(input, 'before-journal');
  const updates = new Map(input.transitions.map(({ phase, to }) => [phase, to]));
  const planAfter = renderPhaseStatuses(data.plan, updates);
  const payloads = input.transitions.map((item) => {
    const path = data.paths.get(item.phase)!; const before = readFileSync(path, 'utf8');
    return { item, path, before, after: renderPhaseFrontmatterStatus(before, item.to, path) };
  });
  const journalPath = `${input.lockPath}/transition.json`;
  if (input.waveId) {
    let journal: ParallelWaveStatusJournal = { schemaVersion: 1, kind: 'wave-completion', controllerId: input.controllerId,
      waveId: input.waveId, planBeforeSha256: sha(data.plan), planAfterSha256: sha(planAfter),
      phases: payloads.map(({ item, before, after }) => ({ phase: item.phase, phaseBeforeSha256: sha(before), phaseAfterSha256: sha(after) })),
      completedFrontmatterCount: 0, stage: 'frontmatters' };
    writeParallelLeaseJson(input.lockPath, input.controllerId, ownerContext, 'transition.json', journal);
    payloads.forEach((payload, index) => {
      if (readFileSync(input.planPath, 'utf8') !== data.plan || readFileSync(payload.path, 'utf8') !== payload.before)
        throw new Error(`status bytes drifted before phase ${payload.item.phase} write`);
      assertParallelControllerOwner(input.lockPath, input.controllerId, ownerContext);
      durableAtomicWriteFileSync(payload.path, payload.after); crash(input, `after-frontmatter-${index + 1}`);
      journal = { ...journal, completedFrontmatterCount: index + 1 };
      writeParallelLeaseJson(input.lockPath, input.controllerId, ownerContext, 'transition.json', journal); crash(input, `after-cursor-${index + 1}`);
    });
    if (readFileSync(input.planPath, 'utf8') !== data.plan) throw new Error('plan bytes drifted before wave write');
    assertParallelControllerOwner(input.lockPath, input.controllerId, ownerContext);
    durableAtomicWriteFileSync(input.planPath, planAfter); crash(input, 'after-plan');
    journal = { ...journal, stage: 'plan-written' };
    writeParallelLeaseJson(input.lockPath, input.controllerId, ownerContext, 'transition.json', journal);
  } else {
    const payload = payloads[0]!; const item = payload.item;
    let journal: ParallelSingleStatusJournal = { schemaVersion: 1, kind: 'single', controllerId: input.controllerId, phase: item.phase,
      from: item.from, to: item.to, planBeforeSha256: sha(data.plan), planAfterSha256: sha(planAfter),
      phaseBeforeSha256: sha(payload.before), phaseAfterSha256: sha(payload.after), stage: 'prepared' };
    writeParallelLeaseJson(input.lockPath, input.controllerId, ownerContext, 'transition.json', journal);
    if (readFileSync(input.planPath, 'utf8') !== data.plan || readFileSync(payload.path, 'utf8') !== payload.before)
      throw new Error(`status bytes drifted before phase ${item.phase} write`);
    assertParallelControllerOwner(input.lockPath, input.controllerId, ownerContext);
    durableAtomicWriteFileSync(payload.path, payload.after); crash(input, 'after-frontmatter');
    journal = { ...journal, stage: 'frontmatter-written' };
    writeParallelLeaseJson(input.lockPath, input.controllerId, ownerContext, 'transition.json', journal);
    if (readFileSync(input.planPath, 'utf8') !== data.plan) throw new Error('plan bytes drifted before single write');
    assertParallelControllerOwner(input.lockPath, input.controllerId, ownerContext);
    durableAtomicWriteFileSync(input.planPath, planAfter); crash(input, 'after-plan');
    journal = { ...journal, stage: 'plan-written' };
    writeParallelLeaseJson(input.lockPath, input.controllerId, ownerContext, 'transition.json', journal);
  }
  if (sha(readFileSync(input.planPath, 'utf8')) !== sha(planAfter)
    || payloads.some(({ path, after }) => sha(readFileSync(path, 'utf8')) !== sha(after))
    || inspectParallelPhaseStatuses(input.projectRoot, input.planPath, input.featureDir).mismatches.length) throw new Error('status verification failed');
  crash(input, 'after-verification'); assertParallelControllerOwner(input.lockPath, input.controllerId, ownerContext);
  durableUnlinkSync(journalPath);
  if (input.waveId || input.transitions[0]!.to !== 'in_progress') {
    settleControllerStatusMutation(input.lockPath, input.controllerId, ownerContext,
      input.transitions.map(({ phase }) => phase));
  }
}

export function recoverParallelPhaseStatuses(input: Omit<TransitionInput, 'transitions'> & {
  journalRoot?: string; journalControllerId?: string;
}): { recovered: boolean } {
  const ownerContext = { projectRoot: input.projectRoot, featureDir: input.featureDir };
  assertParallelControllerOwner(input.lockPath, input.controllerId, ownerContext);
  const journalRoot = input.journalRoot ?? input.lockPath;
  const journalPath = `${journalRoot}/transition.json`;
  if (!existsSync(journalPath)) return { recovered: false };
  const stat = lstatSync(journalPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw new Error('transition journal must be a bounded regular file');
  const journal = parseParallelStatusJournal(readFileSync(journalPath, 'utf8'));
  const expectedJournalController = input.journalControllerId ?? input.controllerId;
  if (journal.controllerId !== expectedJournalController) throw new Error('journal controller mismatch');
  const data = context(input.projectRoot, input.planPath, input.featureDir);
  const phases = journal.kind === 'single' ? [journal.phase] : journal.phases.map(({ phase }) => phase);
  const phaseBytes = phases.map((phase) => readFileSync(data.paths.get(phase)!, 'utf8'));
  validateParallelStatusJournalState(journal, sha(data.plan), phaseBytes.map(sha));
  const planAfter = sha(data.plan) === journal.planAfterSha256;
  [...phases].reverse().forEach((phase) => {
    const index = phases.indexOf(phase);
    const path = data.paths.get(phase)!; const current = phaseBytes[index]!;
    const target = journal.kind === 'single' ? (planAfter ? journal.to : journal.from) : (planAfter ? 'done' : 'in_progress');
    const expected = journal.kind === 'single' ? (planAfter ? journal.phaseAfterSha256 : journal.phaseBeforeSha256)
      : (planAfter ? journal.phases[index]!.phaseAfterSha256 : journal.phases[index]!.phaseBeforeSha256);
    const rendered = renderPhaseFrontmatterStatus(current, target, path);
    if (sha(rendered) !== expected) throw new Error(`phase ${phase} recovery bytes do not match journal`);
    if (rendered !== current) {
      assertParallelControllerOwner(input.lockPath, input.controllerId, ownerContext);
      durableAtomicWriteFileSync(path, rendered);
      crash(input, `after-recovery-phase-${phase}`);
    }
  });
  if (inspectParallelPhaseStatuses(input.projectRoot, input.planPath, input.featureDir).mismatches.length) throw new Error('recovery verification failed');
  assertParallelControllerOwner(input.lockPath, input.controllerId, ownerContext);
  if (journalRoot === input.lockPath) durableUnlinkSync(journalPath);
  return { recovered: true };
}

export function reconcileParallelPhaseStatusesFromPlan(input: {
  projectRoot: string; planPath: string; featureDir: string; lockPath: string; controllerId: string;
}): { reconciled: number[] } {
  const ownerContext = { projectRoot: input.projectRoot, featureDir: input.featureDir };
  assertParallelControllerOwner(input.lockPath, input.controllerId, ownerContext);
  if (existsSync(`${input.lockPath}/transition.json`)) throw new Error('transition journal requires exact recovery first');
  const data = context(input.projectRoot, input.planPath, input.featureDir); const reconciled: number[] = [];
  for (const row of data.rows) {
    const path = data.paths.get(row.number)!; const before = readFileSync(path, 'utf8');
    if (readPhaseFrontmatterStatus(before, path) === row.status) continue;
    const after = renderPhaseFrontmatterStatus(before, row.status, path);
    if (readFileSync(input.planPath, 'utf8') !== data.plan || readFileSync(path, 'utf8') !== before)
      throw new Error(`status bytes drifted before reconciling phase ${row.number}`);
    assertParallelControllerOwner(input.lockPath, input.controllerId, ownerContext);
    durableAtomicWriteFileSync(path, after); reconciled.push(row.number);
  }
  if (inspectParallelPhaseStatuses(input.projectRoot, input.planPath, input.featureDir).mismatches.length) throw new Error('reconciliation verification failed');
  return { reconciled };
}
