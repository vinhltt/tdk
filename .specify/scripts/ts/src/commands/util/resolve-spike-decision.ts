import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { writeAgentJson } from '../../utils';
import { resolveSpikeDecisionTransitions } from './spike-decision-transitions';

const program = new Command()
  .name('resolve-spike-decision')
  .description('Compute safe spike and dependent phase status transitions')
  .argument('<plan-path>', 'Path to plan.md')
  .requiredOption('--phase-number <number>', 'Spike phase number', Number)
  .requiredOption('--decision <decision>', 'approve or replan')
  .option('--json', 'Emit compact JSON', false)
  .action((planPath: string, options: { phaseNumber: number; decision: string; json: boolean }) => {
    if (options.decision !== 'approve' && options.decision !== 'replan') {
      process.stderr.write('ERROR: --decision must be approve or replan\n');
      process.exitCode = 1;
      return;
    }
    const result = resolveSpikeDecisionTransitions(
      readFileSync(planPath, 'utf8'),
      options.phaseNumber,
      options.decision,
    );
    if (options.json) writeAgentJson(result);
    else console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  });

program.parse();
