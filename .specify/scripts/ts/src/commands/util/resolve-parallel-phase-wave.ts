/**
 * resolve-parallel-phase-wave.ts (C-B6 CLI edge)
 *
 * Standalone script:
 *   bun src/commands/util/resolve-parallel-phase-wave.ts --project-root <path> --plan <plan-path> [--validate-only]
 *
 * Thin CLI edge over `runParallelPhaseWaveOperation` (parallel-phase-wave-operation.ts),
 * which holds the actual orchestration and mode split. Default mode is
 * `schedule`: per C-B5, the filesystem capability check and case-sensitivity
 * probe gate the work, running against the project root BEFORE
 * `buildPhaseScheduleInputs`'s fixed-deny classification and
 * `resolveParallelPhaseWave`'s path-overlap conflict detection, both of which
 * are exact-string comparisons that assume a proven case-sensitive root. The
 * capability check runs a second time after wave selection, against the
 * selected phases' actual access paths: those aren't known until then, and
 * the root-only pass above cannot see a nested foreign mount at a specific
 * access path (Findings A/B still require this second pass).
 *
 * `--validate-only` runs the same graph/input/wave-resolution logic but skips
 * both the capability check and the case probe (execution-host admission),
 * and returns a non-executable `valid`/`invalid` payload with no `wave` or
 * `serialBarrier` field — planner artifact correctness is host-independent,
 * so this is what planner finalization uses instead of pretending the
 * current host can schedule parallel work.
 *
 * Exit 0 for wave|serial-barrier|complete (`schedule`) or valid
 * (`validate-only`). Exit 2 for an expected validation/policy rejection
 * (invalid graph, unsupported filesystem, unreadable phase file, denied
 * access, no ready phase). Exit 1 for an unexpected I/O/runtime failure.
 */

import { Command } from 'commander';
import { formatAgentJson, writeAgentJson } from '../../utils';
import { runParallelPhaseWaveOperation } from './parallel-phase-wave-operation';

const program = new Command()
  .name('resolve-parallel-phase-wave')
  .description('Resolve the next executable parallel wave, serial barrier, completion, or invalid scheduling state')
  .requiredOption('--project-root <path>', 'Project root')
  .requiredOption('--plan <path>', 'Path to plan.md')
  .option('--validate-only', 'Validate planner artifacts without host execution admission (no wave/serialBarrier)')
  .action((options: { projectRoot: string; plan: string; validateOnly?: boolean }) => {
    try {
      const { payload, exitCode } = runParallelPhaseWaveOperation({
        projectRoot: options.projectRoot,
        planPath: options.plan,
        mode: options.validateOnly ? 'validate-only' : 'schedule',
      });
      writeAgentJson(payload);
      process.exitCode = exitCode;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      process.stdout.write(formatAgentJson({ error: message }));
      process.exitCode = 1;
    }
  });

program.parse();
