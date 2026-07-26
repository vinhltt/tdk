/**
 * parallel-phase-wave-resolver.ts (C-B3 + C-B6)
 *
 * Pure ascending-greedy wave scheduler over already-classified phase inputs.
 * No file I/O — the CLI edge (`resolve-parallel-phase-wave.ts`) owns reading
 * plan.md/phase files and building `PhaseScheduleInput[]` via
 * `parallel-phase-graph-validator.ts`, `phase-frontmatter-reader.ts`, and
 * `parallel-phase-ownership.ts`.
 *
 * Canonical order (C-B3): rows are sorted ascending by `.number` before any
 * scheduling decision, independent of the order callers pass them in (which
 * may follow raw Markdown row order).
 *
 * "Auto rows BELOW the barrier" (design note — do not re-litigate in Phase
 * 3/4): the earliest ready legacy/`never` row in ascending order is the
 * serial barrier; only ready `auto` rows numerically BEFORE it are ever wave
 * candidates. Scheduling rows numerically after the barrier while the
 * barrier itself waits would make the barrier meaningless and would starve
 * the earliest ready row — so "below" means numerically smaller, matching
 * ascending scan order.
 */

import { detectPhaseAccessConflicts, type WaveConflict } from './parallel-phase-ownership';
import type { Diagnostic } from './parallel-phase-graph-validator';
import type { PhaseStatus } from './phases-table-parser';

/** One phase's scheduling-relevant facts, already classified by the caller. */
export interface PhaseScheduleInput {
  number: number;
  status: PhaseStatus;
  blockedBy: number[];
  /** `null` = legacy (parallel_safe absent/unrecognized), treated as serial-only. */
  parallelSafe: 'auto' | 'never' | null;
  access: { reads: string[]; writes: string[] };
}

export type WaveState = 'wave' | 'serial-barrier' | 'complete' | 'invalid';

export interface WaveResolution {
  ok: boolean;
  state: WaveState;
  wave: number[];
  serialBarrier: number | null;
  conflicts: WaveConflict[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

const TERMINAL_STATUSES: ReadonlySet<PhaseStatus> = new Set(['done', 'skipped', 'cancelled']);
const WAVE_CAP = 4;

/** Only `done`/`skipped` satisfy a BlockedBy edge — `cancelled` is terminal but never satisfies one. */
function dependencySatisfied(status: PhaseStatus): boolean {
  return status === 'done' || status === 'skipped';
}

function legacyBarrierWarning(phaseNumber: number): Diagnostic {
  return {
    code: 'LEGACY_SERIAL_BARRIER',
    message: `phase ${phaseNumber} has no parallel_safe metadata; treated as a serial-only barrier`,
    phase: phaseNumber,
  };
}

/** Minimal shape `readyPhaseNumbers` needs — a subset of `PhaseScheduleInput`. */
export interface ReadinessRow {
  number: number;
  status: PhaseStatus;
  blockedBy: number[];
}

/**
 * Single source of truth for "ready" (C-B6): status `todo` AND every
 * `blockedBy` target is `done` or `skipped` (`cancelled` is terminal but
 * never satisfies a dependency). Callers that only need readiness — e.g.
 * the CLI's input builder deciding which phase files are worth reading —
 * can call this directly from raw table rows, without building full
 * `PhaseScheduleInput`s first.
 */
export function readyPhaseNumbers(rows: readonly ReadinessRow[]): Set<number> {
  const byNumber = new Map(rows.map((r) => [r.number, r]));
  const ready = new Set<number>();
  for (const row of rows) {
    if (row.status !== 'todo') continue;
    const satisfied = row.blockedBy.every((dep) => {
      const blocker = byNumber.get(dep);
      return blocker !== undefined && dependencySatisfied(blocker.status);
    });
    if (satisfied) ready.add(row.number);
  }
  return ready;
}

/** Greedily add conflict-free candidates (already in scheduling order), capped at WAVE_CAP. */
function selectConflictFreeWave(candidates: readonly PhaseScheduleInput[]): {
  selected: PhaseScheduleInput[];
  conflicts: WaveConflict[];
} {
  const selected: PhaseScheduleInput[] = [];
  const conflicts: WaveConflict[] = [];

  for (const candidate of candidates) {
    if (selected.length >= WAVE_CAP) break;
    let deferred = false;
    for (const already of selected) {
      const found = detectPhaseAccessConflicts(
        { phase: already.number, reads: already.access.reads, writes: already.access.writes },
        { phase: candidate.number, reads: candidate.access.reads, writes: candidate.access.writes },
      );
      if (found.length > 0) {
        conflicts.push(...found);
        deferred = true;
      }
    }
    if (!deferred) selected.push(candidate);
  }

  return { selected, conflicts };
}

/**
 * Resolve the single next executable scheduling decision. Never precomputes
 * future waves — callers recompute from scratch after every wave completes.
 */
export function resolveParallelPhaseWave(phases: readonly PhaseScheduleInput[]): WaveResolution {
  const sorted = [...phases].sort((a, b) => a.number - b.number);
  const readyNumbers = readyPhaseNumbers(sorted);
  const ready = sorted.filter((p) => readyNumbers.has(p.number));

  if (ready.length === 0) {
    const allTerminal = sorted.every((p) => TERMINAL_STATUSES.has(p.status));
    if (allTerminal) {
      return { ok: true, state: 'complete', wave: [], serialBarrier: null, conflicts: [], errors: [], warnings: [] };
    }
    return {
      ok: false,
      state: 'invalid',
      wave: [],
      serialBarrier: null,
      conflicts: [],
      errors: [{ code: 'NO_READY_PHASE', message: 'work remains but no phase is ready to schedule' }],
      warnings: [],
    };
  }

  const barrierIdx = ready.findIndex((p) => p.parallelSafe !== 'auto');
  const warnings: Diagnostic[] = [];
  if (barrierIdx !== -1) {
    const barrier = ready[barrierIdx]!;
    if (barrier.parallelSafe === null) warnings.push(legacyBarrierWarning(barrier.number));
  }

  if (barrierIdx === 0) {
    return {
      ok: true,
      state: 'serial-barrier',
      wave: [],
      serialBarrier: ready[0]!.number,
      conflicts: [],
      errors: [],
      warnings,
    };
  }

  const candidatePool = barrierIdx === -1 ? ready : ready.slice(0, barrierIdx);
  const { selected, conflicts } = selectConflictFreeWave(candidatePool);

  return {
    ok: true,
    state: 'wave',
    wave: selected.map((p) => p.number),
    serialBarrier: null,
    conflicts,
    errors: [],
    warnings,
  };
}
