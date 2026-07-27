/**
 * parallel-phase-wave-operation.ts
 *
 * Functional Core / Imperative Shell extraction of the resolver orchestration
 * previously inlined in `resolve-parallel-phase-wave.ts`, split by an explicit
 * `WaveOperationMode` rather than a generic bypass flag:
 *
 * - `schedule` (default): identical ordering and output to the pre-existing
 *   CLI — graph validation, root filesystem capability, case-sensitivity
 *   probe, schedule-input build, wave resolution, then selected-access
 *   capability. This is execution admission: it is host-dependent by design
 *   and native Windows/DrvFS/nested-mount/device-boundary rejections must
 *   stay exactly as strict as before.
 * - `validate-only`: graph validation, schedule-input build, wave resolution,
 *   then a projection to a non-executable `WaveValidationResult` — no host
 *   capability check, no case probe (which mkdirs a sentinel under the
 *   project root), no `wave`/`serialBarrier` fields. Artifact correctness is
 *   host-independent; this mode proves the plan is well-formed without
 *   pretending the current host can schedule parallel work on it.
 *
 * Both modes share graph parsing, phase-input construction, and the pure wave
 * resolver — never a second validator — so there is exactly one source of
 * truth for what counts as a valid plan.
 */

import { readFileSync, realpathSync } from 'node:fs';
import type { Diagnostic } from './parallel-phase-graph-validator';
import { validatePhaseGraph } from './parallel-phase-graph-validator';
import {
  findNearestExistingAncestor,
  resolveProjectFilesystemCapability,
  type FilesystemCapabilityOptions,
  type FilesystemCapabilityResult,
  type WaveConflict,
} from './parallel-phase-ownership';
import { probeProjectCaseSensitivity, type CaseProbeResult } from './parallel-phase-case-probe';
import { resolveParallelPhaseWave, type WaveResolution } from './parallel-phase-wave-resolver';
import { buildPhaseScheduleInputs } from './resolve-parallel-phase-wave-input-builder';

export type WaveOperationMode = 'schedule' | 'validate-only';

/** Non-executable projection: deliberately carries no `wave` and no `serialBarrier`. */
export interface WaveValidationResult {
  ok: boolean;
  state: 'valid' | 'invalid';
  conflicts: WaveConflict[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

export interface WaveOperationDeps {
  /** Test seam only. Defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** Test seam only. Defaults to the real `resolveProjectFilesystemCapability`. */
  resolveCapability?: (
    realProjectRoot: string, accessPaths: readonly string[], options?: FilesystemCapabilityOptions,
  ) => FilesystemCapabilityResult;
  /** Test seam only. Defaults to the real `probeProjectCaseSensitivity`. */
  probeCaseSensitivity?: (projectRoot: string) => CaseProbeResult;
}

export interface WaveOperationInput {
  projectRoot: string;
  planPath: string;
  mode: WaveOperationMode;
}

export interface WaveOperationOutput {
  payload: WaveResolution | WaveValidationResult;
  exitCode: number;
}

function invalidWave(errors: Diagnostic[], warnings: Diagnostic[] = []): WaveResolution {
  return { ok: false, state: 'invalid', wave: [], serialBarrier: null, conflicts: [], errors, warnings };
}

function toValidationResult(result: WaveResolution): WaveValidationResult {
  return {
    ok: result.ok,
    state: result.state === 'invalid' ? 'invalid' : 'valid',
    conflicts: result.conflicts,
    errors: result.errors,
    warnings: result.warnings,
  };
}

function finalize(
  result: WaveResolution, exitCode: number, mode: WaveOperationMode,
): WaveOperationOutput {
  return { payload: mode === 'schedule' ? result : toValidationResult(result), exitCode };
}

/**
 * Resolve the next executable parallel wave (`schedule`) or a non-executable
 * validation payload (`validate-only`) for `planPath` against `projectRoot`.
 * Throws on unexpected I/O/runtime failure (e.g. an unreadable `--plan`) —
 * the caller is responsible for the exit-1 boundary.
 */
export function runParallelPhaseWaveOperation(
  input: WaveOperationInput,
  deps: WaveOperationDeps = {},
): WaveOperationOutput {
  const resolveCapability = deps.resolveCapability ?? resolveProjectFilesystemCapability;
  const probeCaseSensitivity = deps.probeCaseSensitivity ?? probeProjectCaseSensitivity;
  const capabilityOptions: FilesystemCapabilityOptions = { platform: deps.platform };

  const realRoot = realpathSync.native(input.projectRoot);
  const planMarkdown = readFileSync(input.planPath, 'utf8');

  const graph = validatePhaseGraph(planMarkdown, 'parallel');
  if (graph.errors.length > 0) return finalize(invalidWave(graph.errors, graph.warnings), 2, input.mode);

  if (input.mode === 'schedule') {
    // Root-only gate, before any case-sensitivity-dependent path work below.
    const rootCapability = resolveCapability(realRoot, [], capabilityOptions);
    if (!rootCapability.ok) {
      return finalize(invalidWave(
        [{ code: 'FILESYSTEM_CAPABILITY_UNSUPPORTED', message: rootCapability.reason ?? 'filesystem capability check failed' }],
        graph.warnings,
      ), 2, input.mode);
    }

    const caseProbe = probeCaseSensitivity(realRoot);
    if (!caseProbe.ok) {
      return finalize(invalidWave(
        [{ code: 'CASE_SENSITIVITY_PROBE_FAILED', message: caseProbe.reason ?? 'case sensitivity probe failed' }],
        graph.warnings,
      ), 2, input.mode);
    }
  }

  const { inputs, errors: gatherErrors } = buildPhaseScheduleInputs(graph.phases, input.planPath, realRoot);
  if (gatherErrors.length > 0) return finalize(invalidWave(gatherErrors), 2, input.mode);

  const result = resolveParallelPhaseWave(inputs);

  if (input.mode === 'validate-only') {
    return finalize(result, result.state === 'invalid' ? 2 : 0, input.mode);
  }

  if (result.state !== 'wave' || result.wave.length === 0) {
    return finalize(result, result.state === 'invalid' ? 2 : 0, input.mode);
  }

  const byNumber = new Map(inputs.map((phaseInput) => [phaseInput.number, phaseInput]));
  const accessPaths = result.wave.flatMap((number) => {
    const phaseInput = byNumber.get(number);
    if (!phaseInput) return [];
    return [...phaseInput.access.reads, ...phaseInput.access.writes]
      .map((relPath) => findNearestExistingAncestor(realRoot, relPath));
  });

  const capability = resolveCapability(realRoot, accessPaths, capabilityOptions);
  if (!capability.ok) {
    return finalize(invalidWave(
      [{ code: 'FILESYSTEM_CAPABILITY_UNSUPPORTED', message: capability.reason ?? 'filesystem capability check failed' }],
      result.warnings,
    ), 2, input.mode);
  }

  return finalize(result, 0, input.mode);
}
