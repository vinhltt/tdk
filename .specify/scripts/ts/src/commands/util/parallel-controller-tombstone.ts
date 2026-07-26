import { realpathSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  assertParallelControllerOwner, readParallelControllerOwner, type LeaseOwnerContext,
} from './parallel-controller-lease';

export { findParallelControllerRecoveryTombstones } from './parallel-controller-tombstone-paths';

export function removeParallelControllerTombstone(input: {
  lockPath: string;
  tombstonePath: string;
  expectedOldControllerId: string;
  recoveryControllerId: string;
  context: LeaseOwnerContext;
}): void {
  assertParallelControllerOwner(input.lockPath, input.recoveryControllerId, input.context);
  const expectedPath = `${input.lockPath}.recovered-${input.expectedOldControllerId}-${input.recoveryControllerId}`;
  if (input.tombstonePath !== expectedPath || dirname(input.tombstonePath) !== dirname(input.lockPath)) {
    throw new Error('recovery tombstone path is not owned by this recovery');
  }
  const owner = readParallelControllerOwner(input.tombstonePath);
  if (!owner || owner.controllerId !== input.expectedOldControllerId
    || owner.projectRoot !== realpathSync.native(input.context.projectRoot)
    || owner.featureDir !== realpathSync.native(input.context.featureDir)) {
    throw new Error(`recovery tombstone owner mismatch at ${input.tombstonePath}`);
  }
  rmSync(input.tombstonePath, { recursive: true });
}
