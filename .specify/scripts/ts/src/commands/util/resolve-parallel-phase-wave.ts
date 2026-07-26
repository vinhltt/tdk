/**
 * resolve-parallel-phase-wave.ts (C-B6 CLI edge)
 *
 * Standalone script:
 *   bun src/commands/util/resolve-parallel-phase-wave.ts --project-root <path> --plan <plan-path>
 *
 * Gathers plan.md + phase-file state into `PhaseScheduleInput[]` and calls
 * the pure `resolveParallelPhaseWave`. Per C-B5, the filesystem capability
 * check and case-sensitivity probe gate the work: they run against the
 * project root BEFORE `buildPhaseScheduleInputs`'s fixed-deny classification
 * and `resolveParallelPhaseWave`'s path-overlap conflict detection, both of
 * which are exact-string comparisons that assume a proven case-sensitive
 * root. This means the probe (which creates and removes one sentinel
 * directory under the project root) now runs on every invocation that gets
 * past graph validation — including `serial-barrier`/`complete`/`invalid`
 * outcomes, not only a selected `wave` — trading the prior "skip the probe
 * unless we schedule parallel work" optimization for the contract's ordering
 * guarantee. The capability check runs a second time after wave selection,
 * against the selected phases' actual access paths: those aren't known until
 * then, and the root-only pass above cannot see a nested foreign mount at a
 * specific access path (Findings A/B still require this second pass).
 *
 * Exit 0 for wave|serial-barrier|complete. Exit 2 for an expected
 * validation/policy rejection (invalid graph, unsupported filesystem,
 * unreadable phase file, denied access, no ready phase). Exit 1 for an
 * unexpected I/O/runtime failure.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { Command } from 'commander';
import { formatAgentJson, writeAgentJson } from '../../utils';
import { validatePhaseGraph, type Diagnostic } from './parallel-phase-graph-validator';
import {
  findNearestExistingAncestor,
  probeProjectCaseSensitivity,
  resolveProjectFilesystemCapability,
} from './parallel-phase-ownership';
import { resolveParallelPhaseWave, type WaveResolution } from './parallel-phase-wave-resolver';
import { buildPhaseScheduleInputs } from './resolve-parallel-phase-wave-input-builder';

function invalidResult(errors: Diagnostic[], warnings: Diagnostic[] = []): WaveResolution {
  return { ok: false, state: 'invalid', wave: [], serialBarrier: null, conflicts: [], errors, warnings };
}

function emitAndExit(result: WaveResolution, exitCode: number): void {
  writeAgentJson(result);
  process.exitCode = exitCode;
}

const program = new Command()
  .name('resolve-parallel-phase-wave')
  .description('Resolve the next executable parallel wave, serial barrier, completion, or invalid scheduling state')
  .requiredOption('--project-root <path>', 'Project root')
  .requiredOption('--plan <path>', 'Path to plan.md')
  .action((options: { projectRoot: string; plan: string }) => {
    try {
      const realRoot = realpathSync.native(options.projectRoot);
      const planMarkdown = readFileSync(options.plan, 'utf8');

      const graph = validatePhaseGraph(planMarkdown, 'parallel');
      if (graph.errors.length > 0) {
        emitAndExit(invalidResult(graph.errors, graph.warnings), 2);
        return;
      }

      // Root-only gate, before any case-sensitivity-dependent path work below.
      const rootCapability = resolveProjectFilesystemCapability(realRoot, []);
      if (!rootCapability.ok) {
        emitAndExit(
          invalidResult(
            [{ code: 'FILESYSTEM_CAPABILITY_UNSUPPORTED', message: rootCapability.reason ?? 'filesystem capability check failed' }],
            graph.warnings,
          ),
          2,
        );
        return;
      }

      const caseProbe = probeProjectCaseSensitivity(realRoot);
      if (!caseProbe.ok) {
        emitAndExit(
          invalidResult(
            [{ code: 'CASE_SENSITIVITY_PROBE_FAILED', message: caseProbe.reason ?? 'case sensitivity probe failed' }],
            graph.warnings,
          ),
          2,
        );
        return;
      }

      const { inputs, errors: gatherErrors } = buildPhaseScheduleInputs(graph.phases, options.plan, realRoot);
      if (gatherErrors.length > 0) {
        emitAndExit(invalidResult(gatherErrors), 2);
        return;
      }

      const result = resolveParallelPhaseWave(inputs);
      if (result.state !== 'wave' || result.wave.length === 0) {
        emitAndExit(result, result.state === 'invalid' ? 2 : 0);
        return;
      }

      const byNumber = new Map(inputs.map((input) => [input.number, input]));
      const accessPaths = result.wave.flatMap((number) => {
        const input = byNumber.get(number);
        if (!input) return [];
        return [...input.access.reads, ...input.access.writes].map((relPath) => findNearestExistingAncestor(realRoot, relPath));
      });

      const capability = resolveProjectFilesystemCapability(realRoot, accessPaths);
      if (!capability.ok) {
        emitAndExit(
          invalidResult(
            [{ code: 'FILESYSTEM_CAPABILITY_UNSUPPORTED', message: capability.reason ?? 'filesystem capability check failed' }],
            result.warnings,
          ),
          2,
        );
        return;
      }

      emitAndExit(result, 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      process.stdout.write(formatAgentJson({ error: message }));
      process.exitCode = 1;
    }
  });

program.parse();
