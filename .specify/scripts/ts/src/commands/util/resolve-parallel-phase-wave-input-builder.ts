/**
 * resolve-parallel-phase-wave-input-builder.ts (C-B6 CLI support)
 *
 * Reads each currently-*ready* phase's file to classify parallel safety and
 * (for `auto` phases) resolve canonical read/write access, producing the
 * `PhaseScheduleInput[]` the pure resolver in
 * `parallel-phase-wave-resolver.ts` needs. Every other row — terminal, or
 * `todo` but not yet ready (e.g. still `blockedBy` an in-progress phase) —
 * only needs its table-level status/blockedBy for the resolver's readiness
 * pass, so those rows get inert placeholders. This is not just an I/O
 * optimization: a not-yet-ready row may declare access to a path a still-
 * pending earlier phase hasn't created yet (e.g. `Modify` on a file phase 1
 * will `Create`), which `resolvePhaseAccess` correctly rejects as not found.
 * Validating that row now — before it's actually up for scheduling — would
 * wrongly block the current, perfectly valid wave.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Diagnostic } from './parallel-phase-graph-validator';
import { readParallelSafety, readPhaseFrontmatter } from './phase-frontmatter-reader';
import { resolvePhaseAccess } from './parallel-phase-ownership';
import { readyPhaseNumbers, type PhaseScheduleInput } from './parallel-phase-wave-resolver';
import type { PhaseRow } from './phases-table-parser';

export interface BuildScheduleInputsResult {
  inputs: PhaseScheduleInput[];
  errors: Diagnostic[];
}

function inertInput(row: PhaseRow, parallelSafe: 'auto' | 'never' | null = null): PhaseScheduleInput {
  return { number: row.number, status: row.status, blockedBy: row.blockedBy, parallelSafe, access: { reads: [], writes: [] } };
}

/** Build one ready row's schedule input by reading its phase file. Any failure is recorded, never thrown. */
function buildReadyInput(row: PhaseRow, planPath: string, realRoot: string, errors: Diagnostic[]): PhaseScheduleInput {
  const phasePath = join(dirname(planPath), row.file);
  let markdown: string;
  try {
    markdown = readFileSync(phasePath, 'utf8');
  } catch {
    errors.push({ code: 'PHASE_FILE_UNREADABLE', message: `could not read phase file '${phasePath}'`, phase: row.number, path: phasePath });
    return inertInput(row);
  }

  const { metadata, error: frontmatterError } = readPhaseFrontmatter(markdown);
  if (frontmatterError) {
    // Fail closed by construction: an unparsable frontmatter block must never
    // be laundered into "legacy" (parallelSafe: null) — that would report
    // LEGACY_SERIAL_BARRIER for a phase that may well declare `parallel_safe:
    // auto` inside the broken block, and exit 0 instead of 2. `'never'` still
    // yields a serial barrier but with no misleading warning, since the
    // resolver only warns on a `null` (genuinely legacy) barrier.
    errors.push({ code: 'PHASE_FRONTMATTER_UNPARSABLE', message: frontmatterError, phase: row.number, path: phasePath });
    return inertInput(row, 'never');
  }

  const safety = readParallelSafety(metadata);
  for (const message of safety.errors) {
    errors.push({ code: 'PARALLEL_SAFETY_ERROR', message, phase: row.number });
  }

  if (safety.parallelSafe !== 'auto') {
    return inertInput(row, safety.parallelSafe);
  }

  const access = resolvePhaseAccess(markdown, realRoot);
  errors.push(...access.errors);
  if (access.errors.length > 0) {
    // Fail closed by construction: a phase whose access set failed to
    // resolve completely must not be schedulable as `auto` with a truncated
    // reads/writes set, independent of any caller-side error guard.
    return inertInput(row, 'never');
  }
  return {
    number: row.number,
    status: row.status,
    blockedBy: row.blockedBy,
    parallelSafe: 'auto',
    access: { reads: access.reads, writes: access.writes.map((entry) => entry.path) },
  };
}

/**
 * Build `PhaseScheduleInput[]` for every phase row. `planPath` locates each
 * row's phase file relative to plan.md's directory; `realRoot` is the
 * already-canonicalized project root forwarded to `resolvePhaseAccess`.
 */
export function buildPhaseScheduleInputs(
  phases: readonly PhaseRow[],
  planPath: string,
  realRoot: string,
): BuildScheduleInputsResult {
  const errors: Diagnostic[] = [];
  const ready = readyPhaseNumbers(phases.map((row) => ({ number: row.number, status: row.status, blockedBy: row.blockedBy })));
  const inputs = phases.map((row) => (ready.has(row.number) ? buildReadyInput(row, planPath, realRoot, errors) : inertInput(row)));
  return { inputs, errors };
}
