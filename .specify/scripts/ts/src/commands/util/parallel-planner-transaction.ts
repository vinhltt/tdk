import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { durableUnlinkSync } from './durable-atomic-file';
import { assertParallelControllerOwner, writeParallelLeaseJson } from './parallel-controller-lease';
import { findParallelControllerRecoveryTombstones } from './parallel-controller-tombstone-paths';
import {
  capturePlannerSnapshot, readPlannerSnapshot, restorePlannerSnapshot,
} from './parallel-planner-snapshot';
import { validatePlannerFinalState } from './parallel-planner-validation';

type Input = {
  projectRoot: string; featureDir: string; lockPath: string; controllerId: string;
  crashAt?: string; externalPaths?: string[];
};

function assertPlanner(input: Input): void {
  const owner = assertParallelControllerOwner(input.lockPath, input.controllerId, input);
  if (owner.purpose !== 'planner') throw new Error('planner transaction requires a planner reservation');
  const featureRelative = relative(resolve(input.projectRoot), resolve(input.featureDir));
  if (!featureRelative || featureRelative.startsWith('..') || isAbsolute(featureRelative)) {
    throw new Error('planner feature directory must be a project subdirectory');
  }
}

export function snapshotPlannerMutation(input: Input): { entries: number; external: number } {
  assertPlanner(input);
  if (findParallelControllerRecoveryTombstones(input.lockPath, input.controllerId).length) {
    throw new Error('planner takeover must recover its tombstone before a new snapshot');
  }
  const path = join(input.lockPath, 'planner-snapshot.json');
  if (existsSync(path)) throw new Error('planner snapshot already exists');
  const snapshot = capturePlannerSnapshot({ ...input, externalPaths: input.externalPaths ?? [] });
  writeParallelLeaseJson(input.lockPath, input.controllerId, input, 'planner-snapshot.json', snapshot);
  return { entries: snapshot.entries.length, external: snapshot.external.length };
}

export function finalizePlannerMutation(input: Input): void {
  assertPlanner(input);
  const path = join(input.lockPath, 'planner-snapshot.json');
  const snapshot = readPlannerSnapshot({ ...input, path, controllerId: input.controllerId });
  if (!snapshot) throw new Error('planner snapshot is missing');
  validatePlannerFinalState({ ...input, snapshot });
  assertParallelControllerOwner(input.lockPath, input.controllerId, input);
  readPlannerSnapshot({ ...input, path, controllerId: input.controllerId });
  durableUnlinkSync(path);
}

export function recoverPlannerMutation(input: Input & {
  snapshotRoot?: string; snapshotControllerId?: string;
}): { recovered: boolean } {
  assertPlanner(input);
  const snapshotRoot = input.snapshotRoot ?? input.lockPath;
  const path = join(snapshotRoot, 'planner-snapshot.json');
  const snapshot = readPlannerSnapshot({ ...input, path,
    controllerId: input.snapshotControllerId ?? input.controllerId });
  if (!snapshot) return { recovered: false };
  restorePlannerSnapshot({ ...input, snapshot });
  if (snapshotRoot === input.lockPath) {
    assertParallelControllerOwner(input.lockPath, input.controllerId, input);
    readPlannerSnapshot({ ...input, path, controllerId: input.controllerId });
    durableUnlinkSync(path);
  }
  return { recovered: true };
}
