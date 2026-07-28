import { Command } from 'commander';
import { writeAgentJson } from '../../utils/agent-output';
import { inspectParallelPhaseStatuses, transitionParallelPhaseStatuses } from './parallel-phase-status-reconciler';
import { VALID_STATUSES, type PhaseStatus } from './phases-table-parser';

interface Common { projectRoot: string; plan: string; featureDir: string }
const collect = (value: string, previous: string[]): string[] => [...previous, value];
const run = (action: () => unknown): void => {
  try { writeAgentJson(action()); } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    writeAgentJson({ error: message });
    process.exitCode = 1;
  }
};

const program = new Command().name('transition-phase-status')
  .description('Lease-free phase status transitions across plan.md and phase frontmatter')
  .requiredOption('--project-root <path>').requiredOption('--plan <path>').requiredOption('--feature-dir <path>')
  .option('--phase <n>', 'phase number (repeatable)', collect, [])
  .option('--to <status>', 'target status (repeatable)', collect, [])
  .option('--wave-id <id>', 'wave id gating a 1-4 phase in_progress→done batch')
  .action((options: Common & { phase: string[]; to: string[]; waveId?: string }) => run(() => {
    if (options.phase.length === 0 || options.phase.length !== options.to.length) {
      throw new Error('--phase and --to must repeat in matching pairs');
    }
    const status = inspectParallelPhaseStatuses(options.projectRoot, options.plan, options.featureDir);
    const transitions = options.phase.map((phaseStr, index) => {
      const phase = Number(phaseStr);
      const row = status.rows.find((entry) => entry.phase === phase);
      if (!row) throw new Error(`phase ${phase} not found in ## Phases table`);
      const to = options.to[index]!;
      if (!VALID_STATUSES.has(to)) throw new Error(`invalid status '${to}' — expected one of: ${[...VALID_STATUSES].join(', ')}`);
      return { phase, from: row.planStatus, to: to as PhaseStatus };
    });
    transitionParallelPhaseStatuses({
      projectRoot: options.projectRoot, planPath: options.plan, featureDir: options.featureDir,
      waveId: options.waveId, transitions,
    });
    return { ok: true, phases: transitions.map(({ phase }) => phase) };
  }));

// Deliberately declares no options of its own: commander binds `--project-root`/`--plan`/
// `--feature-dir` to the root command regardless of argv position relative to this subcommand
// name, so this subcommand reads them back off `program.opts()`.
program.command('inspect-status')
  .action(() => run(() => {
    const options = program.opts<Common>();
    return inspectParallelPhaseStatuses(options.projectRoot, options.plan, options.featureDir);
  }));

program.parse();
