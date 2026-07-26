import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { writeAgentJson } from '../../utils';
import { validatePhaseFile } from './phase-file-validator';

const program = new Command()
  .name('validate-phase-file')
  .description('Validate normal and spike phase contracts')
  .argument('<phase-path>', 'Path to phase-NN-*.md')
  .requiredOption('--phase-number <number>', 'Numeric phase number', Number)
  .option('--plan <path>', 'Path to plan.md; required for spike phases')
  .option('--require-result', 'Require a non-pending Spike Result', false)
  .option('--mode <mode>', 'Validation mode: serial or parallel', 'serial')
  .option('--project-root <path>', 'Project root; required when --mode parallel')
  .option('--json', 'Emit compact JSON', false)
  .action((phasePath: string, options: {
    phaseNumber: number;
    plan?: string;
    requireResult: boolean;
    mode: string;
    projectRoot?: string;
    json: boolean;
  }) => {
    if (options.mode !== 'serial' && options.mode !== 'parallel') {
      process.stderr.write(`Error: --mode must be 'serial' or 'parallel', got '${options.mode}'\n`);
      process.exit(1);
    }
    const result = validatePhaseFile(readFileSync(phasePath, 'utf8'), {
      phaseNumber: options.phaseNumber,
      planMarkdown: options.plan ? readFileSync(options.plan, 'utf8') : undefined,
      requireResult: options.requireResult,
      validationMode: options.mode,
      projectRoot: options.projectRoot,
    });
    if (options.json) writeAgentJson(result);
    else console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  });

program.parse();
