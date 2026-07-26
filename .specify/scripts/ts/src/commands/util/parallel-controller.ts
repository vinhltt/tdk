import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { z } from 'zod';
import { readControllerLeaseJson, readControllerLeaseText, runControllerOperation } from './parallel-controller-cli-support';
import {
  acquireParallelControllerLease, assertParallelControllerOwner, recoverParallelControllerLease,
  releaseParallelControllerLease, resolveParallelControllerLockPath, writeParallelLeaseJson,
} from './parallel-controller-lease';
import { findParallelControllerRecoveryTombstones } from './parallel-controller-tombstone';
import { inspectParallelPhaseStatuses, transitionParallelPhaseStatuses } from './parallel-phase-status-reconciler';
import { parseParallelWorkerResult } from './parallel-worker-result';
import {
  AuditPhaseSchema, ParallelWaveBaselineSchema, auditParallelWaveFinal,
  auditParallelWavePostWorker, captureParallelWaveBaseline, inspectParallelGitTree,
} from './parallel-wave-git-audit';
import { probeProjectCaseSensitivity } from './parallel-phase-case-probe';
import { resolveProjectFilesystemCapability } from './parallel-phase-mount-capability';
import { openControllerEvidence } from './parallel-controller-mutation-state';
import { finalizePlannerMutation, snapshotPlannerMutation } from './parallel-planner-transaction';
import { durableUnlinkSync } from './durable-atomic-file';
import { reconcileControllerStatus, recoverControllerPlan } from './parallel-controller-recovery';

const StatusSchema = z.enum(['todo', 'in_progress', 'done', 'skipped', 'blocked', 'cancelled']);
const TransitionInputSchema = z.object({
  controllerId: z.string().min(1), waveId: z.string().min(1).optional(), crashAt: z.string().optional(),
  transitions: z.array(z.object({ phase: z.number().int().positive(), from: StatusSchema, to: StatusSchema }).strict()),
}).strict();
const SnapshotInputSchema = z.object({
  controllerId: z.string().min(1), waveId: z.string().min(1),
  protectedPaths: z.array(z.string()), phases: z.array(AuditPhaseSchema),
}).strict();
const PurposeSchema = z.enum(['serial-implement', 'planner']);
const PlannerSnapshotInputSchema = z.object({ controllerId: z.string().min(1), externalPaths: z.array(z.string()) }).strict();
const ExpectedSchema = z.object({
  controllerId: z.string(), waveId: z.string(), workerId: z.string(), phase: z.number().int().positive(),
  criteria: z.array(z.string()), delegates: z.array(z.string()).optional(),
}).strict();
const AuditInputSchema = z.object({ controllerId: z.string().min(1),
  workers: z.array(z.object({ resultPath: z.string(), expected: ExpectedSchema }).strict()) }).strict();

interface Common { projectRoot: string; featureDir: string } interface Owned extends Common { controllerId: string }
const planPath = (options: Common): string => join(options.featureDir, 'plan.md');
const lockPath = (options: Common): string => resolveParallelControllerLockPath(options.projectRoot);
const ownerContext = (options: Common): Common => ({ projectRoot: options.projectRoot, featureDir: options.featureDir });
const assertOwner = (options: Owned) => assertParallelControllerOwner(lockPath(options), options.controllerId, ownerContext(options));
const assertPurpose = (options: Owned, purposes: Array<ReturnType<typeof assertOwner>['purpose']>) => {
  const owner = assertOwner(options);
  if (!purposes.includes(owner.purpose)) throw new Error(`operation is not allowed for ${owner.purpose} reservation`);
  return owner;
};

function common(command: Command): Command { return command.requiredOption('--project-root <path>').requiredOption('--feature-dir <path>'); }

const program = new Command().name('parallel-controller').description('Fenced parallel phase controller lifecycle');

common(program.command('acquire'))
  .requiredOption('--task-id <id>').option('--controller-id <id>')
  .action((options: Common & { taskId: string; controllerId?: string }) => runControllerOperation(() => {
    const result = acquireParallelControllerLease({ ...options, purpose: 'parallel-implement' });
    if (!result.ok) { process.exitCode = 2; return result; }
    const capability = resolveProjectFilesystemCapability(result.owner.projectRoot, [result.owner.projectRoot]);
    const caseProbe = capability.ok ? probeProjectCaseSensitivity(result.owner.projectRoot) : { ok: false, reason: capability.reason };
    if (!capability.ok || !caseProbe.ok) {
      releaseParallelControllerLease(result.lockPath, result.owner.controllerId, ownerContext(options)); process.exitCode = 2;
      return { ok: false, reason: caseProbe.reason ?? capability.reason, released: true };
    }
    try {
      const baseline = captureParallelWaveBaseline({ projectRoot: options.projectRoot, protectedPaths: [], phases: [] });
      const gitTree = inspectParallelGitTree(options.projectRoot);
      return { ...result, preflight: { head: baseline.head, ref: baseline.ref, entries: gitTree.entries, errors: gitTree.errors } };
    } catch (error) {
      releaseParallelControllerLease(result.lockPath, result.owner.controllerId, ownerContext(options)); throw error;
    }
  }));

common(program.command('reserve'))
  .requiredOption('--task-id <id>').requiredOption('--purpose <purpose>').option('--controller-id <id>')
  .action((options: Common & { taskId: string; purpose: string; controllerId?: string }) => runControllerOperation(() => {
    const result = acquireParallelControllerLease({ ...options, purpose: PurposeSchema.parse(options.purpose) });
    if (!result.ok) process.exitCode = 2;
    return result;
  }));

common(program.command('recover'))
  .requiredOption('--task-id <id>').requiredOption('--expected-controller-id <id>').option('--controller-id <id>')
  .action((options: Common & { taskId: string; expectedControllerId: string; controllerId?: string }) => runControllerOperation(() =>
    recoverParallelControllerLease(options)));

common(program.command('assert-owner')).requiredOption('--controller-id <id>')
  .action((options: Owned) => runControllerOperation(() => ({ ok: true, owner: assertOwner(options) })));

common(program.command('inspect-status')).requiredOption('--controller-id <id>')
  .action((options: Owned) => runControllerOperation(() => {
    assertOwner(options);
    return inspectParallelPhaseStatuses(options.projectRoot, planPath(options), options.featureDir);
  }));

common(program.command('reconcile-status')).requiredOption('--controller-id <id>')
  .option('--plan-source', 'Explicitly copy plan.md SoT statuses to phase frontmatter')
  .option('--old-controller-id <id>')
  .action((options: Owned & { planSource?: boolean; oldControllerId?: string }) =>
    runControllerOperation(() => reconcileControllerStatus(options)));

common(program.command('snapshot-plan')).requiredOption('--controller-id <id>').requiredOption('--input-json <path>')
  .action((options: Owned & { inputJson: string }) => runControllerOperation(() => {
    const lock = lockPath(options); const input = readControllerLeaseJson(options.inputJson, lock, PlannerSnapshotInputSchema);
    if (input.controllerId !== options.controllerId) throw new Error('input controller identity mismatch');
    return snapshotPlannerMutation({ ...options, lockPath: lock, externalPaths: input.externalPaths });
  }));

common(program.command('finalize-plan')).requiredOption('--controller-id <id>')
  .action((options: Owned) => runControllerOperation(() => {
    finalizePlannerMutation({ ...options, lockPath: lockPath(options) }); return { ok: true };
  }));

common(program.command('recover-plan')).requiredOption('--controller-id <id>')
  .option('--old-controller-id <id>').option('--crash-at <point>')
  .action((options: Owned & { oldControllerId?: string; crashAt?: string }) =>
    runControllerOperation(() => recoverControllerPlan(options)));

common(program.command('transition-status')).requiredOption('--controller-id <id>').requiredOption('--input-json <path>')
  .action((options: Owned & { inputJson: string }) => runControllerOperation(() => {
    const lock = lockPath(options);
    const owner = assertPurpose(options, ['parallel-implement', 'serial-implement']);
    const input = readControllerLeaseJson(options.inputJson, lock, TransitionInputSchema);
    if (input.controllerId !== options.controllerId) throw new Error('input controller identity mismatch');
    if (input.waveId) {
      if (owner.purpose !== 'parallel-implement') throw new Error('wave completion requires a parallel reservation');
      const baseline = ParallelWaveBaselineSchema.parse(JSON.parse(readFileSync(join(lock, 'wave-baseline.json'), 'utf8')));
      const phases = input.transitions.map(({ phase }) => phase);
      if (!baseline.finalized || baseline.waveId !== input.waveId
        || JSON.stringify(baseline.phases.map(({ phase }) => phase)) !== JSON.stringify(phases)) {
        throw new Error('wave completion requires the matching finalized audit baseline');
      }
      const finalCheck = auditParallelWaveFinal({ projectRoot: options.projectRoot, baseline });
      if (!finalCheck.ok) throw new Error(`wave completion audit drift: ${finalCheck.errors.join('; ')}`);
    }
    transitionParallelPhaseStatuses({
      ...input, projectRoot: options.projectRoot, planPath: planPath(options),
      featureDir: options.featureDir, lockPath: lock,
    });
    if (input.waveId) durableUnlinkSync(join(lock, 'wave-baseline.json'));
    return { ok: true, phases: input.transitions.map(({ phase }) => phase) };
  }));

common(program.command('snapshot-wave')).requiredOption('--controller-id <id>').requiredOption('--input-json <path>')
  .action((options: Owned & { inputJson: string }) => runControllerOperation(() => {
    const lock = lockPath(options); assertPurpose(options, ['parallel-implement']);
    const input = readControllerLeaseJson(options.inputJson, lock, SnapshotInputSchema);
    if (input.controllerId !== options.controllerId) throw new Error('input controller identity mismatch');
    const gitTree = inspectParallelGitTree(options.projectRoot);
    if (gitTree.errors.length) throw new Error(gitTree.errors.join('; '));
    const baseline = captureParallelWaveBaseline({ projectRoot: options.projectRoot, waveId: input.waveId,
      protectedPaths: input.protectedPaths, phases: input.phases });
    writeParallelLeaseJson(lock, options.controllerId, ownerContext(options), 'wave-baseline.json', baseline);
    return { ok: true, baseline };
  }));

common(program.command('audit-wave')).requiredOption('--controller-id <id>').requiredOption('--stage <stage>')
  .option('--input-json <path>')
  .action((options: Owned & { stage: string; inputJson?: string }) => runControllerOperation(() => {
    const lock = lockPath(options); assertPurpose(options, ['parallel-implement']);
    const baseline = ParallelWaveBaselineSchema.parse(JSON.parse(readFileSync(join(lock, 'wave-baseline.json'), 'utf8')));
    if (options.stage === 'final') {
      if (options.inputJson) throw new Error('final audit accepts no worker input JSON');
      const result = auditParallelWaveFinal({ projectRoot: options.projectRoot, baseline });
      if (!result.ok) process.exitCode = 2;
      else writeParallelLeaseJson(lock, options.controllerId, ownerContext(options), 'wave-baseline.json', result.baseline);
      return result;
    }
    if (options.stage !== 'post-worker' || !options.inputJson) throw new Error('post-worker audit requires one input JSON');
    const input = readControllerLeaseJson(options.inputJson, lock, AuditInputSchema);
    if (input.controllerId !== options.controllerId) throw new Error('input controller identity mismatch');
    const results = input.workers.map(({ resultPath, expected }) =>
      parseParallelWorkerResult(readControllerLeaseText(resultPath, lock), expected));
    const result = auditParallelWavePostWorker({ projectRoot: options.projectRoot, baseline, results });
    if (!result.ok) process.exitCode = 2;
    else writeParallelLeaseJson(lock, options.controllerId, ownerContext(options), 'wave-baseline.json', result.baseline);
    return result;
  }));

common(program.command('release')).requiredOption('--controller-id <id>')
  .action((options: Owned) => runControllerOperation(() => {
    const lock = lockPath(options);
    const evidence = openControllerEvidence(lock);
    if (evidence.length) throw new Error(`cannot release while controller evidence exists: ${evidence.join(', ')}`);
    if (findParallelControllerRecoveryTombstones(lock, options.controllerId).length) {
      throw new Error('cannot release while recovery tombstone exists');
    }
    if (existsSync(planPath(options))) {
      const status = inspectParallelPhaseStatuses(options.projectRoot, planPath(options), options.featureDir);
      if (status.mismatches.length) throw new Error('cannot release while phase and plan statuses differ');
    }
    releaseParallelControllerLease(lock, options.controllerId, ownerContext(options));
    return { ok: true, lockPath: lock };
  }));

program.parse();
