import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertParallelControllerOwner, readParallelControllerOwner, resolveParallelControllerLockPath,
} from './parallel-controller-lease';
import { removeParallelControllerTombstone } from './parallel-controller-tombstone';
import { clearControllerExecutionEvidence } from './parallel-controller-mutation-state';
import {
  inspectParallelPhaseStatuses, reconcileParallelPhaseStatusesFromPlan,
  recoverParallelPhaseStatuses,
} from './parallel-phase-status-reconciler';
import { recoverPlannerMutation } from './parallel-planner-transaction';
import { ParallelWaveBaselineSchema, auditParallelWaveRecoveryTree } from './parallel-wave-git-audit';

interface Options {
  projectRoot: string; featureDir: string; controllerId: string;
  oldControllerId?: string; planSource?: boolean; crashAt?: string;
}
const ownerContext = ({ projectRoot, featureDir }: Options) => ({ projectRoot, featureDir });

function verifyOldWaveEvidence(projectRoot: string, tombstonePath: string): void {
  const path = join(tombstonePath, 'wave-baseline.json');
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) {
    throw new Error('wave baseline must be a bounded regular file');
  }
  const baseline = ParallelWaveBaselineSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const audit = auditParallelWaveRecoveryTree({ projectRoot, baseline });
  if (!audit.ok) throw new Error(`old wave evidence does not match the worktree: ${audit.errors.join('; ')}`);
}

export function reconcileControllerStatus(options: Options): { recovered: boolean } | { reconciled: number[] } {
  const lockPath = resolveParallelControllerLockPath(options.projectRoot);
  const planPath = join(options.featureDir, 'plan.md');
  if (assertParallelControllerOwner(lockPath, options.controllerId, ownerContext(options)).purpose === 'planner') {
    throw new Error('planner reservations require recover-plan');
  }
  let result: { recovered: boolean } | { reconciled: number[] };
  if (options.oldControllerId) {
    const tombstonePath = `${lockPath}.recovered-${options.oldControllerId}-${options.controllerId}`;
    if (readParallelControllerOwner(tombstonePath)?.purpose === 'planner') {
      throw new Error('planner reservations require recover-plan');
    }
    result = recoverParallelPhaseStatuses({ ...options, planPath, lockPath,
      journalRoot: tombstonePath, journalControllerId: options.oldControllerId });
    const journalRecovered = result.recovered;
    if (!result.recovered) {
      result = options.planSource
        ? reconcileParallelPhaseStatusesFromPlan({ ...options, planPath, lockPath }) : { reconciled: [] };
      if (inspectParallelPhaseStatuses(options.projectRoot, planPath, options.featureDir).mismatches.length) {
        throw new Error('unjournaled status split requires --plan-source');
      }
    }
    if (!journalRecovered) verifyOldWaveEvidence(options.projectRoot, tombstonePath);
    removeParallelControllerTombstone({ lockPath, tombstonePath,
      expectedOldControllerId: options.oldControllerId, recoveryControllerId: options.controllerId,
      context: ownerContext(options) });
  } else {
    result = options.planSource
      ? reconcileParallelPhaseStatusesFromPlan({ ...options, planPath, lockPath })
      : recoverParallelPhaseStatuses({ ...options, planPath, lockPath });
    if (inspectParallelPhaseStatuses(options.projectRoot, planPath, options.featureDir).mismatches.length) {
      throw new Error('status recovery did not reach a stable state');
    }
    clearControllerExecutionEvidence(lockPath, options.controllerId, ownerContext(options));
  }
  return result;
}

export function recoverControllerPlan(options: Options): { recovered: boolean } {
  const lockPath = resolveParallelControllerLockPath(options.projectRoot);
  if (!options.oldControllerId) return recoverPlannerMutation({ ...options, lockPath });
  const tombstonePath = `${lockPath}.recovered-${options.oldControllerId}-${options.controllerId}`;
  const result = recoverPlannerMutation({ ...options, lockPath,
    snapshotRoot: tombstonePath, snapshotControllerId: options.oldControllerId });
  if (!result.recovered) throw new Error('old planner snapshot is missing; recovery tombstone retained');
  removeParallelControllerTombstone({ lockPath, tombstonePath,
    expectedOldControllerId: options.oldControllerId, recoveryControllerId: options.controllerId,
    context: ownerContext(options) });
  return result;
}
