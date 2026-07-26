import { describe, expect, it } from 'bun:test';
import {
  readyPhaseNumbers,
  resolveParallelPhaseWave,
  type PhaseScheduleInput,
} from '../src/commands/util/parallel-phase-wave-resolver';

/** Default: ready `auto` phase with a unique write so it never conflicts unless overridden. */
function phase(overrides: Partial<PhaseScheduleInput> & { number: number }): PhaseScheduleInput {
  return {
    status: 'todo',
    blockedBy: [],
    parallelSafe: 'auto',
    access: { reads: [], writes: [`writes/phase-${overrides.number}.ts`] },
    ...overrides,
  };
}

describe('resolveParallelPhaseWave — scheduling', () => {
  it('independent-phases wave: unrelated auto phases share one wave', () => {
    const result = resolveParallelPhaseWave([phase({ number: 1 }), phase({ number: 2 }), phase({ number: 3 })]);
    expect(result.ok).toBe(true);
    expect(result.state).toBe('wave');
    expect(result.wave).toEqual([1, 2, 3]);
    expect(result.serialBarrier).toBeNull();
    expect(result.conflicts).toEqual([]);
  });

  it('clean-diamond wave: siblings blocked by the same completed phase share a wave, downstream stays out', () => {
    const result = resolveParallelPhaseWave([
      phase({ number: 1, status: 'done' }),
      phase({ number: 2, blockedBy: [1] }),
      phase({ number: 3, blockedBy: [1] }),
      phase({ number: 4, blockedBy: [2, 3] }),
    ]);
    expect(result.state).toBe('wave');
    expect(result.wave).toEqual([2, 3]);
  });

  it('cap-of-four enforcement: 5 eligible auto rows yield exactly 4', () => {
    const phases = [1, 2, 3, 4, 5].map((n) => phase({ number: n }));
    const result = resolveParallelPhaseWave(phases);
    expect(result.state).toBe('wave');
    expect(result.wave).toEqual([1, 2, 3, 4]);
  });

  it('write/write conflict defers the later candidate', () => {
    const result = resolveParallelPhaseWave([
      phase({ number: 1, access: { reads: [], writes: ['shared/file.ts'] } }),
      phase({ number: 2, access: { reads: [], writes: ['shared/file.ts'] } }),
    ]);
    expect(result.wave).toEqual([1]);
    expect(result.conflicts).toEqual([
      { phase: 1, candidate: 2, phasePath: 'shared/file.ts', candidatePath: 'shared/file.ts', access: 'write-write', overlap: 'same-path' },
    ]);
  });

  it('write/read conflict — earlier writes, later reads — defers the later candidate', () => {
    const result = resolveParallelPhaseWave([
      phase({ number: 1, access: { reads: [], writes: ['shared/file.ts'] } }),
      phase({ number: 2, access: { reads: ['shared/file.ts'], writes: [] } }),
    ]);
    expect(result.wave).toEqual([1]);
    expect(result.conflicts).toEqual([
      { phase: 1, candidate: 2, phasePath: 'shared/file.ts', candidatePath: 'shared/file.ts', access: 'write-read', overlap: 'same-path' },
    ]);
  });

  it('write/read conflict — earlier reads, later writes — still defers the later candidate', () => {
    const result = resolveParallelPhaseWave([
      phase({ number: 1, access: { reads: ['shared/file.ts'], writes: [] } }),
      phase({ number: 2, access: { reads: [], writes: ['shared/file.ts'] } }),
    ]);
    expect(result.wave).toEqual([1]);
    expect(result.conflicts).toEqual([
      { phase: 1, candidate: 2, phasePath: 'shared/file.ts', candidatePath: 'shared/file.ts', access: 'read-write', overlap: 'same-path' },
    ]);
  });

  it('read/read overlap on the same path shares a wave', () => {
    const result = resolveParallelPhaseWave([
      phase({ number: 1, access: { reads: ['shared/file.ts'], writes: [] } }),
      phase({ number: 2, access: { reads: ['shared/file.ts'], writes: [] } }),
    ]);
    expect(result.state).toBe('wave');
    expect(result.wave).toEqual([1, 2]);
    expect(result.conflicts).toEqual([]);
  });

  it('legacy-absent phase at the front of ready order warns and becomes the serial barrier', () => {
    const result = resolveParallelPhaseWave([phase({ number: 1, parallelSafe: null })]);
    expect(result.state).toBe('serial-barrier');
    expect(result.serialBarrier).toBe(1);
    expect(result.wave).toEqual([]);
    expect(result.warnings).toEqual([
      { code: 'LEGACY_SERIAL_BARRIER', message: expect.stringContaining('phase 1'), phase: 1 },
    ]);
  });

  it('legacy-absent phase later in ready order still warns even though earlier auto rows form a wave', () => {
    const result = resolveParallelPhaseWave([
      phase({ number: 1 }),
      phase({ number: 2, parallelSafe: null }),
    ]);
    expect(result.state).toBe('wave');
    expect(result.wave).toEqual([1]);
    expect(result.warnings).toEqual([
      { code: 'LEGACY_SERIAL_BARRIER', message: expect.stringContaining('phase 2'), phase: 2 },
    ]);
  });

  it('parallel_safe: never becomes the serial barrier without a legacy warning', () => {
    const result = resolveParallelPhaseWave([phase({ number: 1, parallelSafe: 'never' })]);
    expect(result.state).toBe('serial-barrier');
    expect(result.serialBarrier).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('all-terminal rows report complete with an empty wave', () => {
    const result = resolveParallelPhaseWave([
      phase({ number: 1, status: 'done' }),
      phase({ number: 2, status: 'skipped' }),
      phase({ number: 3, status: 'cancelled' }),
    ]);
    expect(result.ok).toBe(true);
    expect(result.state).toBe('complete');
    expect(result.wave).toEqual([]);
  });

  it('work remains but nothing is ready reports invalid with NO_READY_PHASE', () => {
    const result = resolveParallelPhaseWave([phase({ number: 1, status: 'blocked' })]);
    expect(result.ok).toBe(false);
    expect(result.state).toBe('invalid');
    expect(result.wave).toEqual([]);
    expect(result.errors).toEqual([{ code: 'NO_READY_PHASE', message: expect.stringContaining('no phase is ready') }]);
  });

  it('cancelled is terminal but does not satisfy a dependency', () => {
    const result = resolveParallelPhaseWave([
      phase({ number: 1, status: 'cancelled' }),
      phase({ number: 2, blockedBy: [1] }),
    ]);
    expect(result.state).toBe('invalid');
    expect(result.errors[0]?.code).toBe('NO_READY_PHASE');
  });

  it('C-B3: canonical numeric-ascending order applies regardless of input array order', () => {
    const three = phase({ number: 3 });
    const one = phase({ number: 1 });
    const two = phase({ number: 2 });
    const result = resolveParallelPhaseWave([three, one, two]);
    expect(result.state).toBe('wave');
    expect(result.wave).toEqual([1, 2, 3]);
  });
});

describe('readyPhaseNumbers', () => {
  it('excludes a todo row that is not yet ready (blocked by a non-terminal dependency)', () => {
    const ready = readyPhaseNumbers([
      { number: 1, status: 'todo', blockedBy: [] },
      { number: 2, status: 'in_progress', blockedBy: [] },
      { number: 3, status: 'todo', blockedBy: [2] },
    ]);
    expect(ready).toEqual(new Set([1]));
  });

  it('includes a todo row whose dependency is done or skipped', () => {
    const ready = readyPhaseNumbers([
      { number: 1, status: 'done', blockedBy: [] },
      { number: 2, status: 'skipped', blockedBy: [] },
      { number: 3, status: 'todo', blockedBy: [1, 2] },
    ]);
    expect(ready).toEqual(new Set([3]));
  });
});
