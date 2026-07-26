import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { durableAtomicWriteFileSync } from './durable-atomic-file';
import { findParallelControllerRecoveryTombstones } from './parallel-controller-tombstone-paths';

const ControllerIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
export const ParallelControllerOwnerSchema = z.object({
  schemaVersion: z.literal(1),
  controllerId: ControllerIdSchema,
  taskId: z.string().min(1),
  purpose: z.enum(['parallel-implement', 'serial-implement', 'planner']),
  projectRoot: z.string().min(1),
  featureDir: z.string().min(1),
  gitWorktreeDir: z.string().min(1),
  harness: z.literal('claude'),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type ParallelControllerOwner = z.infer<typeof ParallelControllerOwnerSchema>;

export interface AcquireLeaseInput {
  projectRoot: string; featureDir: string; taskId: string;
  controllerId?: string; purpose?: ParallelControllerOwner['purpose']; now?: string;
}
export type AcquireLeaseResult =
  | { ok: true; lockPath: string; owner: ParallelControllerOwner }
  | { ok: false; reason: 'lease-held'; lockPath: string; owner: ParallelControllerOwner | null };

export interface LeaseOwnerContext { projectRoot: string; featureDir: string }

function gitPath(projectRoot: string, argument: '--git-common-dir' | '--git-dir'): string {
  const result = spawnSync('git', ['rev-parse', '--path-format=absolute', argument], {
    cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`project root is not a Git worktree: ${projectRoot}`);
  }
  return result.stdout.trim();
}

export function resolveParallelControllerLockPath(projectRoot: string): string {
  return join(gitPath(projectRoot, '--git-common-dir'), 'tdk', 'parallel-controller.lock');
}

function atomicJson(path: string, value: unknown): void {
  durableAtomicWriteFileSync(path, `${JSON.stringify(value)}\n`, 0o600);
}

function readOwner(lockPath: string): ParallelControllerOwner | null {
  try {
    const path = join(lockPath, 'owner.json');
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 65536) return null;
    return ParallelControllerOwnerSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

function buildOwner(input: AcquireLeaseInput): ParallelControllerOwner {
  const now = input.now ?? new Date().toISOString();
  const projectRoot = realpathSync.native(input.projectRoot);
  const featureDir = realpathSync.native(input.featureDir);
  const featureRelative = relative(projectRoot, featureDir);
  if (featureRelative.startsWith('..') || isAbsolute(featureRelative)) {
    throw new Error('feature directory must be inside project root');
  }
  return {
    schemaVersion: 1,
    controllerId: ControllerIdSchema.parse(input.controllerId ?? randomUUID()),
    taskId: input.taskId,
    purpose: input.purpose ?? 'parallel-implement',
    projectRoot,
    featureDir,
    gitWorktreeDir: gitPath(input.projectRoot, '--git-dir'),
    harness: 'claude',
    startedAt: now,
    updatedAt: now,
  };
}

function sameOwnerContext(left: ParallelControllerOwner, right: ParallelControllerOwner): boolean {
  return left.controllerId === right.controllerId && left.projectRoot === right.projectRoot
    && left.featureDir === right.featureDir && left.gitWorktreeDir === right.gitWorktreeDir
    && left.purpose === right.purpose;
}

export function readParallelControllerOwner(lockPath: string): ParallelControllerOwner | null {
  return readOwner(lockPath);
}

function installLease(lockPath: string, owner: ParallelControllerOwner): void {
  mkdirSync(dirname(lockPath), { recursive: true });
  try { mkdirSync(lockPath); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('lease-held');
    throw error;
  }
  try { atomicJson(join(lockPath, 'owner.json'), owner); } catch (error) {
    rmSync(lockPath, { recursive: true, force: true });
    throw error;
  }
}

export function acquireParallelControllerLease(input: AcquireLeaseInput): AcquireLeaseResult {
  const lockPath = resolveParallelControllerLockPath(input.projectRoot);
  const owner = buildOwner(input);
  try {
    installLease(lockPath, owner);
    return { ok: true, lockPath, owner };
  } catch (error) {
    if (error instanceof Error && error.message === 'lease-held') {
      return { ok: false, reason: 'lease-held', lockPath, owner: readOwner(lockPath) };
    }
    throw error;
  }
}

export function assertParallelControllerOwner(
  lockPath: string,
  controllerId: string,
  context: LeaseOwnerContext,
): ParallelControllerOwner {
  const owner = readOwner(lockPath);
  const projectRoot = realpathSync.native(context.projectRoot);
  const featureDir = realpathSync.native(context.featureDir);
  const gitWorktreeDir = gitPath(projectRoot, '--git-dir');
  if (!owner || owner.controllerId !== controllerId || owner.projectRoot !== projectRoot
    || owner.featureDir !== featureDir || owner.gitWorktreeDir !== gitWorktreeDir) {
    throw new Error(`controller fenced at ${lockPath}`);
  }
  return owner;
}

export function recoverParallelControllerLease(
  input: AcquireLeaseInput & { expectedControllerId: string },
): { lockPath: string; tombstonePath: string; owner: ParallelControllerOwner } {
  const lockPath = resolveParallelControllerLockPath(input.projectRoot);
  const oldOwner = readOwner(lockPath);
  if (!oldOwner || oldOwner.controllerId !== input.expectedControllerId) {
    throw new Error('lease owner does not match expected old controller');
  }
  if (findParallelControllerRecoveryTombstones(lockPath, oldOwner.controllerId).length) {
    throw new Error('lease owner has an unfinished recovery tombstone');
  }
  if (oldOwner.purpose === 'planner' && !existsSync(join(lockPath, 'planner-snapshot.json'))) {
    throw new Error('planner lease has no durable snapshot for takeover recovery');
  }
  const owner = buildOwner({ ...input, purpose: oldOwner.purpose });
  if (oldOwner.projectRoot !== owner.projectRoot || oldOwner.featureDir !== owner.featureDir
    || oldOwner.gitWorktreeDir !== owner.gitWorktreeDir) {
    throw new Error('lease owner context does not match recovery request');
  }
  const tombstonePath = `${lockPath}.recovered-${oldOwner.controllerId}-${owner.controllerId}`;
  renameSync(lockPath, tombstonePath);
  const movedOwner = readOwner(tombstonePath);
  if (!movedOwner || !sameOwnerContext(movedOwner, oldOwner)) {
    try { renameSync(tombstonePath, lockPath); } catch { /* preserve both paths for manual recovery */ }
    throw new Error('lease changed during recovery takeover');
  }
  try { installLease(lockPath, owner); } catch (error) {
    renameSync(tombstonePath, lockPath);
    throw error;
  }
  return { lockPath, tombstonePath, owner };
}

export function releaseParallelControllerLease(
  lockPath: string,
  controllerId: string,
  context: LeaseOwnerContext,
): void {
  const owner = assertParallelControllerOwner(lockPath, controllerId, context);
  const releasePath = `${lockPath}.releasing-${controllerId}-${randomUUID()}`;
  renameSync(lockPath, releasePath);
  const movedOwner = readOwner(releasePath);
  if (!movedOwner || !sameOwnerContext(movedOwner, owner)) {
    try { renameSync(releasePath, lockPath); } catch { /* preserve both paths for manual recovery */ }
    throw new Error('lease changed during release');
  }
  rmSync(releasePath, { recursive: true });
}

export function writeParallelLeaseJson(
  lockPath: string,
  controllerId: string,
  context: LeaseOwnerContext,
  name: string,
  value: unknown,
): string {
  assertParallelControllerOwner(lockPath, controllerId, context);
  if (!['transition.json', 'wave-baseline.json', 'mutation-state.json', 'planner-snapshot.json'].includes(name)) {
    throw new Error(`unsupported lease file: ${name}`);
  }
  const path = join(lockPath, name);
  atomicJson(path, value);
  return path;
}
