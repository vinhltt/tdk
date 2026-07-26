import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  acquireParallelControllerLease,
  assertParallelControllerOwner,
  recoverParallelControllerLease,
  releaseParallelControllerLease,
} from '../src/commands/util/parallel-controller-lease';
import { removeParallelControllerTombstone } from '../src/commands/util/parallel-controller-tombstone';

const roots: string[] = [];
function gitRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'tdk-lease-'));
  roots.push(root);
  spawnSync('git', ['init', '-q'], { cwd: root });
  return root;
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('parallel controller lease', () => {
  it('acquires atomically, fences a collision, and releases only for its owner', () => {
    const root = gitRoot();
    const first = acquireParallelControllerLease({ projectRoot: root, featureDir: root, taskId: 'feat-1' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(acquireParallelControllerLease({ projectRoot: root, featureDir: root, taskId: 'feat-2' }).ok).toBe(false);
    const context = { projectRoot: root, featureDir: root };
    expect(() => assertParallelControllerOwner(first.lockPath, 'wrong', context)).toThrow('fenced');
    expect(() => releaseParallelControllerLease(first.lockPath, 'wrong', context)).toThrow('fenced');
    releaseParallelControllerLease(first.lockPath, first.owner.controllerId, context);
  });

  it('recovers only the explicitly identified owner and retains a tombstone', () => {
    const root = gitRoot();
    const first = acquireParallelControllerLease({ projectRoot: root, featureDir: root, taskId: 'feat-1' });
    if (!first.ok) throw new Error('acquire failed');
    expect(() => recoverParallelControllerLease({
      projectRoot: root, featureDir: root, taskId: 'feat-2', expectedControllerId: 'wrong',
    })).toThrow('expected old controller');
    const recovered = recoverParallelControllerLease({
      projectRoot: root, featureDir: root, taskId: 'feat-2', expectedControllerId: first.owner.controllerId,
    });
    expect(readFileSync(join(recovered.tombstonePath, 'owner.json'), 'utf8')).toContain(first.owner.controllerId);
    assertParallelControllerOwner(recovered.lockPath, recovered.owner.controllerId, { projectRoot: root, featureDir: root });
    expect(() => removeParallelControllerTombstone({
      lockPath: recovered.lockPath, tombstonePath: root,
      expectedOldControllerId: first.owner.controllerId,
      recoveryControllerId: recovered.owner.controllerId,
      context: { projectRoot: root, featureDir: root },
    })).toThrow('not owned');
    removeParallelControllerTombstone({
      lockPath: recovered.lockPath, tombstonePath: recovered.tombstonePath,
      expectedOldControllerId: first.owner.controllerId,
      recoveryControllerId: recovered.owner.controllerId,
      context: { projectRoot: root, featureDir: root },
    });
  });

  it('fences an owner assertion bound to a different feature directory', () => {
    const root = gitRoot();
    const other = join(root, 'other');
    mkdirSync(other);
    const first = acquireParallelControllerLease({ projectRoot: root, featureDir: root, taskId: 'feat-1' });
    if (!first.ok) throw new Error('acquire failed');
    expect(() => assertParallelControllerOwner(first.lockPath, first.owner.controllerId, {
      projectRoot: root, featureDir: other,
    })).toThrow('fenced');
  });

  it('rejects controller identities that could escape lifecycle paths', () => {
    const root = gitRoot();
    expect(() => acquireParallelControllerLease({
      projectRoot: root, featureDir: root, taskId: 'feat-1', controllerId: '../escape',
    })).toThrow();
  });

  it('rejects a chained takeover until the current recovery consumes its tombstone', () => {
    const root = gitRoot();
    const first = acquireParallelControllerLease({ projectRoot: root, featureDir: root, taskId: 'feat-1', controllerId: 'c1' });
    if (!first.ok) throw new Error('acquire failed');
    recoverParallelControllerLease({ projectRoot: root, featureDir: root, taskId: 'feat-1',
      expectedControllerId: 'c1', controllerId: 'c2' });
    expect(() => recoverParallelControllerLease({ projectRoot: root, featureDir: root, taskId: 'feat-1',
      expectedControllerId: 'c2', controllerId: 'c3' })).toThrow('unfinished recovery tombstone');
  });
});
