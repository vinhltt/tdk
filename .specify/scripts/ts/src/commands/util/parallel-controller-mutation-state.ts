import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { assertParallelControllerOwner, writeParallelLeaseJson } from './parallel-controller-lease';
import { durableUnlinkSync } from './durable-atomic-file';

const MutationStateSchema = z.object({
  schemaVersion: z.literal(1),
  controllerId: z.string().min(1),
  phases: z.array(z.number().int().positive()),
}).strict();

type Context = { projectRoot: string; featureDir: string };

function readState(lockPath: string, controllerId: string): z.infer<typeof MutationStateSchema> | null {
  const path = join(lockPath, 'mutation-state.json');
  if (!existsSync(path)) return null;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) {
    throw new Error('mutation state must be a bounded regular file');
  }
  const state = MutationStateSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (state.controllerId !== controllerId) throw new Error('mutation state controller mismatch');
  if (state.phases.some((phase, index) => index > 0 && state.phases[index - 1]! >= phase)) {
    throw new Error('mutation state phases must be unique and sorted');
  }
  return state;
}

export function markControllerStatusMutation(
  lockPath: string,
  controllerId: string,
  context: Context,
  phases: number[],
): void {
  assertParallelControllerOwner(lockPath, controllerId, context);
  const current = readState(lockPath, controllerId);
  const next = [...new Set([...(current?.phases ?? []), ...phases])].sort((a, b) => a - b);
  writeParallelLeaseJson(lockPath, controllerId, context, 'mutation-state.json', {
    schemaVersion: 1, controllerId, phases: next,
  });
}

export function settleControllerStatusMutation(
  lockPath: string,
  controllerId: string,
  context: Context,
  phases: number[],
): void {
  assertParallelControllerOwner(lockPath, controllerId, context);
  const current = readState(lockPath, controllerId);
  if (!current) return;
  const settled = new Set(phases);
  const remaining = current.phases.filter((phase) => !settled.has(phase));
  if (remaining.length) {
    writeParallelLeaseJson(lockPath, controllerId, context, 'mutation-state.json', {
      ...current, phases: remaining,
    });
  } else {
    durableUnlinkSync(join(lockPath, 'mutation-state.json'));
  }
}

export function clearControllerExecutionEvidence(
  lockPath: string,
  controllerId: string,
  context: Context,
): void {
  assertParallelControllerOwner(lockPath, controllerId, context);
  for (const name of ['mutation-state.json', 'wave-baseline.json']) {
    const path = join(lockPath, name);
    if (existsSync(path)) durableUnlinkSync(path);
  }
}

export function openControllerEvidence(lockPath: string): string[] {
  return ['transition.json', 'mutation-state.json', 'wave-baseline.json', 'planner-snapshot.json']
    .filter((name) => existsSync(join(lockPath, name)));
}
